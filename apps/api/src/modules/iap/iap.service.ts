import { BadRequestException, Injectable } from "@nestjs/common";
import { readFileSync } from "fs";
import { Environment, SignedDataVerifier, VerificationException } from "@apple/app-store-server-library";
import { IAP_PRODUCTS, type Plan } from "../../common/domain/plans";
import { DbService } from "../../common/db/db.service";
import { VerifyIapDto } from "./dto/verify-iap.dto";

interface TransactionPayload {
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  environment?: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
}

@Injectable()
export class IapService {
  constructor(private readonly db: DbService) {}

  async verify(userId: string, dto: VerifyIapDto) {
    await this.db.ensureUser(userId);

    const plan = IAP_PRODUCTS[dto.productId];
    if (!plan) {
      throw new BadRequestException("Unknown Apple IAP product");
    }

    const transaction = await parseTransaction(dto.signedTransactionInfo, dto.productId);
    if (transaction.productId && transaction.productId !== dto.productId) {
      throw new BadRequestException("IAP product does not match transaction payload");
    }
    if (!transaction.transactionId) {
      throw new BadRequestException("StoreKit transaction id is required");
    }

    const transactionId = transaction.transactionId;
    const environment = transaction.environment ?? process.env.APPLE_ENVIRONMENT ?? "Sandbox";
    const purchaseDate = fromAppleMillis(transaction.purchaseDate) ?? new Date();
    const expiresAt = fromAppleMillis(transaction.expiresDate) ?? defaultPlanExpiry();
    const revocationDate = fromAppleMillis(transaction.revocationDate);
    const expired = expiresAt.getTime() <= Date.now();
    const inactive = Boolean(revocationDate) || expired;

    const order = await this.db.one<{ id: string }>(
      `insert into iap_orders (
         user_id, product_id, plan, original_transaction_id, transaction_id, environment,
         purchase_date, expires_at, revocation_date, raw_signed_transaction, status
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (transaction_id) do update
       set raw_signed_transaction = excluded.raw_signed_transaction
       where iap_orders.user_id = excluded.user_id
       returning id`,
      [
        userId,
        dto.productId,
        plan,
        transaction.originalTransactionId ?? transactionId,
        transactionId,
        environment,
        purchaseDate,
        expiresAt,
        revocationDate,
        dto.signedTransactionInfo,
        revocationDate ? "revoked" : expired ? "expired" : "verified"
      ]
    );
    if (!order) {
      throw new BadRequestException("IAP transaction already belongs to another user");
    }

    if (inactive) {
      await this.db.query(
        `update users
         set plan = 'free', plan_expires_at = null
         where id = $1`,
        [userId]
      );
    } else {
      await this.db.query(
        `update users
         set plan = $2, plan_expires_at = $3
         where id = $1`,
        [userId, plan, expiresAt]
      );
    }

    return {
      plan: inactive ? ("free" as Plan) : plan,
      expiresAt: inactive ? null : expiresAt.toISOString(),
      orderId: order?.id
    };
  }
}

async function parseTransaction(signedTransactionInfo: string, productId: string): Promise<TransactionPayload> {
  if (signedTransactionInfo.startsWith("sandbox-storekit-jws.")) {
    if (process.env.NODE_ENV === "production") {
      throw new BadRequestException("Sandbox StoreKit transactions are not accepted in production");
    }

    return {
      productId,
      transactionId: `sandbox-${productId}-${Date.now()}`,
      originalTransactionId: `sandbox-original-${productId}`,
      environment: "Sandbox",
      purchaseDate: Date.now(),
      expiresDate: defaultPlanExpiry().getTime()
    };
  }

  if (allowUnverifiedIapJws()) {
    return parseUnsignedPayload(signedTransactionInfo);
  }

  return verifyAppleSignedTransaction(signedTransactionInfo);
}

async function verifyAppleSignedTransaction(signedTransactionInfo: string): Promise<TransactionPayload> {
  const verifier = createAppleVerifier();
  try {
    return (await verifier.verifyAndDecodeTransaction(signedTransactionInfo)) as TransactionPayload;
  } catch (error) {
    if (error instanceof VerificationException) {
      throw new BadRequestException("StoreKit transaction could not be verified");
    }
    throw error;
  }
}

function createAppleVerifier(): SignedDataVerifier {
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim();
  const rootCertificates = appleRootCertificates();
  if (!bundleId || rootCertificates.length === 0) {
    throw new BadRequestException("Apple IAP verification is not configured");
  }

  const environment = appleEnvironment();
  const appAppleId = appleAppAppleId(environment);
  return new SignedDataVerifier(rootCertificates, true, environment, bundleId, appAppleId);
}

function appleRootCertificates(): Buffer[] {
  const inlineCertificates = process.env.APPLE_ROOT_CA_BASE64?.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean) ?? [];
  const certificateFiles = process.env.APPLE_ROOT_CA_FILES?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  return [
    ...inlineCertificates.map((value) => Buffer.from(value, "base64")),
    ...certificateFiles.map((filePath) => readFileSync(filePath))
  ];
}

function appleEnvironment(): Environment {
  const configured = process.env.APPLE_ENVIRONMENT?.trim().toLowerCase();
  if (process.env.NODE_ENV === "production" && configured !== "production") {
    throw new BadRequestException("APPLE_ENVIRONMENT must be production in production");
  }
  if (configured === "production") {
    return Environment.PRODUCTION;
  }
  if (configured === "xcode") {
    return Environment.XCODE;
  }
  if (configured === "localtesting" || configured === "local_testing") {
    return Environment.LOCAL_TESTING;
  }
  return Environment.SANDBOX;
}

function appleAppAppleId(environment: Environment): number | undefined {
  const raw = process.env.APPLE_APP_APPLE_ID?.trim();
  if (!raw) {
    if (environment === Environment.PRODUCTION) {
      throw new BadRequestException("APPLE_APP_APPLE_ID is required for production IAP verification");
    }
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException("APPLE_APP_APPLE_ID must be a positive integer");
  }
  return value;
}

function allowUnverifiedIapJws(): boolean {
  return process.env.ALLOW_UNVERIFIED_IAP_JWS === "true" && process.env.NODE_ENV !== "production";
}

function parseUnsignedPayload(signedTransactionInfo: string): TransactionPayload {
  const parts = signedTransactionInfo.split(".");
  if (parts.length < 3) {
    throw new BadRequestException("Invalid StoreKit signed transaction format");
  }

  try {
    const payload = JSON.parse(Buffer.from(base64UrlToBase64(parts[1]), "base64").toString("utf8")) as TransactionPayload;
    return payload;
  } catch {
    throw new BadRequestException("Unable to parse StoreKit signed transaction payload");
  }
}

function base64UrlToBase64(value: string): string {
  return value.replace(/-/g, "+").replace(/_/g, "/");
}

function fromAppleMillis(value?: number): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function defaultPlanExpiry(): Date {
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1);
  return expiresAt;
}
