"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileUpload } from "@/components/ui/file-upload";
import { AttachmentDisplay } from "@/components/ui/attachment-display";
import {
  Send,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Trash2,
  Paperclip,
} from "lucide-react";

interface Attachment {
  id: string;
  filename: string;
  path: string;
  mimeType: string;
  size: number;
}

interface Author {
  id: string;
  name: string;
  role: string;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
}

interface Post {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
  attachments: Attachment[];
  _count: { comments: number };
}

interface UploadedFile {
  filename: string;
  path: string;
  mimeType: string;
  size: number;
}

export default function FeedPage() {
  const { data: session } = useSession();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Create post
  const [newContent, setNewContent] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [posting, setPosting] = useState(false);

  // Comments
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [commentLoading, setCommentLoading] = useState<Record<string, boolean>>({});

  const userId = (session?.user as any)?.id;

  const loadPosts = useCallback(async (cursor?: string) => {
    if (!cursor) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/feed?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (cursor) {
          setPosts((prev) => [...prev, ...data.posts]);
        } else {
          setPosts(data.posts);
        }
        setNextCursor(data.nextCursor);
      }
    } catch {
      // silent
    }
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;
    setPosting(true);

    try {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newContent,
          attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
        }),
      });

      if (res.ok) {
        setNewContent("");
        setUploadedFiles([]);
        setShowUpload(false);
        loadPosts();
      }
    } catch {
      // silent
    }
    setPosting(false);
  }

  async function handleDelete(postId: string) {
    if (!confirm("Supprimer ce post ?")) return;
    try {
      await fetch(`/api/feed/${postId}`, { method: "DELETE" });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch {
      // silent
    }
  }

  async function toggleComments(postId: string) {
    const isExpanded = expandedComments[postId];
    setExpandedComments((prev) => ({ ...prev, [postId]: !isExpanded }));

    if (!isExpanded && !comments[postId]) {
      try {
        const res = await fetch(`/api/feed/${postId}/comments`);
        if (res.ok) {
          const data = await res.json();
          setComments((prev) => ({ ...prev, [postId]: data.comments }));
        }
      } catch {
        // silent
      }
    }
  }

  async function handleComment(postId: string) {
    const text = commentText[postId]?.trim();
    if (!text) return;

    setCommentLoading((prev) => ({ ...prev, [postId]: true }));
    try {
      const res = await fetch(`/api/feed/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });

      if (res.ok) {
        const comment = await res.json();
        setComments((prev) => ({
          ...prev,
          [postId]: [...(prev[postId] || []), comment],
        }));
        setCommentText((prev) => ({ ...prev, [postId]: "" }));
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, _count: { comments: p._count.comments + 1 } }
              : p
          )
        );
      }
    } catch {
      // silent
    }
    setCommentLoading((prev) => ({ ...prev, [postId]: false }));
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return "À l'instant";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    if (diffH < 24) return `il y a ${diffH}h`;
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function roleBadge(role: string) {
    if (role === "ADMIN") return <Badge className="text-[10px] bg-red-100 text-red-700 border-0">Admin</Badge>;
    if (role === "MANAGER") return <Badge className="text-[10px] bg-purple-100 text-purple-700 border-0">Manager</Badge>;
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Fil d&apos;actualité</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Communiquez avec tous les collaborateurs
        </p>
      </div>

      {/* New post form */}
      <form onSubmit={handlePost} className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Partagez une information..."
          className="w-full h-20 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-200"
          maxLength={5000}
        />
        {showUpload && (
          <div className="mt-2">
            <FileUpload onFilesUploaded={setUploadedFiles} maxFiles={5} />
          </div>
        )}
        <div className="flex items-center justify-between mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowUpload(!showUpload)}
          >
            <Paperclip className="h-4 w-4 mr-1.5" />
            {showUpload ? "Masquer" : "Joindre fichier"}
          </Button>
          <Button type="submit" size="sm" disabled={posting || !newContent.trim()}>
            {posting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1.5" />
            )}
            Publier
          </Button>
        </div>
      </form>

      {/* Posts */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : posts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <MessageCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Aucune publication pour le moment</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                    {post.author.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-900">
                        {post.author.name}
                      </span>
                      {roleBadge(post.author.role)}
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatDate(post.createdAt)}
                    </span>
                  </div>
                </div>
                {/* Admin can always delete */}
                <button
                  onClick={() => handleDelete(post.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">
                {post.content}
              </p>

              {post.attachments.length > 0 && (
                <AttachmentDisplay attachments={post.attachments} />
              )}

              <div className="mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => toggleComments(post.id)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {post._count.comments > 0
                    ? `${post._count.comments} commentaire(s)`
                    : "Commenter"}
                  {expandedComments[post.id] ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>

                {expandedComments[post.id] && (
                  <div className="mt-3 space-y-2">
                    {(comments[post.id] || []).map((comment) => (
                      <div
                        key={comment.id}
                        className="bg-gray-50 rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-medium text-gray-700">
                            {comment.author.name}
                          </span>
                          {roleBadge(comment.author.role)}
                          <span className="text-[10px] text-gray-400">
                            {formatDate(comment.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{comment.content}</p>
                      </div>
                    ))}

                    <div className="flex gap-2">
                      <input
                        value={commentText[post.id] || ""}
                        onChange={(e) =>
                          setCommentText((prev) => ({
                            ...prev,
                            [post.id]: e.target.value,
                          }))
                        }
                        placeholder="Écrire un commentaire..."
                        className="flex-1 h-8 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleComment(post.id);
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-8"
                        onClick={() => handleComment(post.id)}
                        disabled={
                          commentLoading[post.id] ||
                          !commentText[post.id]?.trim()
                        }
                      >
                        {commentLoading[post.id] ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {nextCursor && (
            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => loadPosts(nextCursor)}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Charger plus
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
