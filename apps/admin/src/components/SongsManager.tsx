import { useMemo, useState } from "react";
import { formatDateTime, formatNumber, shortId } from "../lib/format";
import type { AdminSong } from "../types";
import { EmptyState } from "./EmptyState";
import { StatusPill } from "./StatusPill";

interface SongsManagerProps {
  isSubmitting: boolean;
  onUpdateVisibility: (id: string, visibility: "private" | "public", moderationNote: string) => Promise<void>;
  songs: AdminSong[];
}

const visibilityFilters: Array<AdminSong["visibility"] | "all"> = ["all", "public", "private"];

export function SongsManager({ isSubmitting, onUpdateVisibility, songs }: SongsManagerProps) {
  const [visibilityFilter, setVisibilityFilter] = useState<AdminSong["visibility"] | "all">("all");
  const [query, setQuery] = useState("");
  const [moderationNotes, setModerationNotes] = useState<Record<string, string>>({});

  const filteredSongs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return songs.filter((song) => {
      const matchesVisibility = visibilityFilter === "all" || song.visibility === visibilityFilter;
      const searchable = `${song.id} ${song.title} ${song.theme} ${song.creatorName} ${song.style} ${song.mood}`.toLowerCase();
      return matchesVisibility && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [query, songs, visibilityFilter]);

  return (
    <section className="view-stack" aria-labelledby="songs-title">
      <div className="view-heading">
        <div>
          <h2 id="songs-title">歌曲管理</h2>
          <p>管理平台所有作品，查看互动数据、播放数据、挑战投稿和公开状态。</p>
        </div>
      </div>

      <div className="mini-metric-grid">
        <Metric label="歌曲总数" value={formatNumber(songs.length)} />
        <Metric label="公开作品" value={formatNumber(songs.filter((song) => song.visibility === "public").length)} />
        <Metric label="播放量" value={formatNumber(songs.reduce((total, song) => total + song.playCount, 0))} />
        <Metric label="评论数" value={formatNumber(songs.reduce((total, song) => total + song.commentsCount, 0))} />
      </div>

      <div className="toolbar">
        <div className="segmented-control" role="group" aria-label="歌曲状态筛选">
          {visibilityFilters.map((visibility) => (
            <button
              className={visibility === visibilityFilter ? "segment segment--active" : "segment"}
              key={visibility}
              onClick={() => setVisibilityFilter(visibility)}
              type="button"
            >
              {visibility === "all" ? "全部" : visibilityLabelByKey[visibility]}
            </button>
          ))}
        </div>
        <label className="search-field">
          <span>搜索</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="歌名、创作者、风格、主题"
            type="search"
            value={query}
          />
        </label>
      </div>

      <section className="panel panel--table">
        {filteredSongs.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>作品</th>
                  <th>创作者</th>
                  <th>数据</th>
                  <th>状态</th>
                  <th>时间</th>
                  <th>审核备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredSongs.map((song) => {
                  const nextVisibility = song.visibility === "public" ? "private" : "public";
                  return (
                    <tr key={song.id}>
                      <td className="cell-wide">
                        <div className="song-cell">
                          {song.coverUrl ? <img alt="" src={song.coverUrl} /> : <span className="song-cell__placeholder">♪</span>}
                          <div className="cell-stack">
                            <strong>{song.title}</strong>
                            <span>{song.theme}</span>
                            <small>
                              {song.style} / {song.mood} / {shortId(song.id)}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>{song.creatorName}</td>
                      <td>
                        <div className="cell-stack">
                          <span>{formatNumber(song.playCount)} 播放 / {formatNumber(song.viewCount)} 浏览</span>
                          <span>{formatNumber(song.likesCount)} 赞 / {formatNumber(song.commentsCount)} 评论</span>
                          <span>{song.isSubmittedToChallenge ? "已投稿挑战" : "未投稿挑战"}</span>
                        </div>
                      </td>
                      <td>
                        <StatusPill status={song.visibility} />
                      </td>
                      <td>
                        <div className="cell-stack">
                          <span>{formatDateTime(song.createdAt)}</span>
                          <span>{formatDateTime(song.publishedAt ?? undefined)}</span>
                        </div>
                      </td>
                      <td>
                        <input
                          className="inline-input"
                          onChange={(event) => setModerationNotes((current) => ({ ...current, [song.id]: event.target.value }))}
                          placeholder="可选：下架/恢复原因"
                          value={moderationNotes[song.id] ?? ""}
                        />
                      </td>
                      <td>
                        <button
                          className={nextVisibility === "public" ? "button button--success" : "button button--danger"}
                          disabled={isSubmitting}
                          onClick={() => void onUpdateVisibility(song.id, nextVisibility, moderationNotes[song.id] ?? "")}
                          type="button"
                        >
                          {nextVisibility === "public" ? "恢复公开" : "设为私密"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="没有匹配歌曲" detail="生成或发布作品后，平台歌曲会出现在这里。" />
        )}
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="mini-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

const visibilityLabelByKey: Record<AdminSong["visibility"], string> = {
  private: "私密",
  public: "公开"
};
