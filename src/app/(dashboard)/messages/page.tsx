"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  MessageSquare,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  ChevronRight,
  ArrowLeft,
  Inbox,
  Loader2,
  Filter,
  Paperclip,
} from "lucide-react";
import { AttachmentDisplay } from "@/components/ui/attachment-display";

interface Attachment {
  id: string;
  filename: string;
  path: string;
  mimeType: string;
  size: number;
}

interface Reply {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; name: string; role: string };
  attachments?: Attachment[];
}

interface Message {
  id: string;
  subject: string;
  body: string;
  category: string;
  status: string;
  storeId: string | null;
  employeeId: string;
  createdAt: string;
  readAt: string | null;
  resolvedAt: string | null;
  sender: { id: string; name: string; email: string };
  handler: { id: string; name: string } | null;
  replies: Reply[];
  attachments?: Attachment[];
  _count: { replies: number };
}

interface Stats {
  new: number;
  inProgress: number;
  resolved: number;
  closed: number;
}

const CATEGORIES = [
  { value: "", label: "Toutes catégories" },
  { value: "GENERAL", label: "Général" },
  { value: "PLANNING", label: "Planning" },
  { value: "CONGE", label: "Congé" },
  { value: "ABSENCE", label: "Absence" },
  { value: "ADMINISTRATIF", label: "Administratif" },
  { value: "RECLAMATION", label: "Réclamation" },
  { value: "AUTRE", label: "Autre" },
];

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Clock; bg: string }> = {
  NEW: { label: "Nouveau", color: "bg-blue-100 text-blue-700", icon: Clock, bg: "bg-blue-50 border-blue-200" },
  IN_PROGRESS: { label: "En cours", color: "bg-amber-100 text-amber-700", icon: AlertCircle, bg: "bg-amber-50 border-amber-200" },
  RESOLVED: { label: "Traité", color: "bg-green-100 text-green-700", icon: CheckCircle, bg: "bg-green-50 border-green-200" },
  CLOSED: { label: "Fermé", color: "bg-gray-100 text-gray-600", icon: XCircle, bg: "bg-gray-50 border-gray-200" },
};

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [changingStatus, setChangingStatus] = useState("");

  // Reply
  const [replyText, setReplyText] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);

      const res = await fetch(`/api/messages?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        setStats(data.stats);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMessage || !replyText.trim()) return;

    setReplyLoading(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `Re: ${selectedMessage.subject}`,
          body: replyText,
          parentId: selectedMessage.id,
        }),
      });

      if (res.ok) {
        setReplyText("");
        const detailRes = await fetch(`/api/messages/${selectedMessage.id}`);
        if (detailRes.ok) {
          const updated = await detailRes.json();
          setSelectedMessage(updated);
        }
        loadMessages();
      }
    } catch {
      // silent
    }
    setReplyLoading(false);
  }

  async function changeStatus(newStatus: string) {
    if (!selectedMessage) return;
    setChangingStatus(newStatus);

    try {
      await fetch(`/api/messages/${selectedMessage.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const detailRes = await fetch(`/api/messages/${selectedMessage.id}`);
      if (detailRes.ok) {
        const updated = await detailRes.json();
        setSelectedMessage(updated);
      }
      loadMessages();
      setStatusDialogOpen(false);
    } catch {
      // silent
    }
    setChangingStatus("");
  }

  // Detail view
  if (selectedMessage) {
    const statusInfo = STATUS_MAP[selectedMessage.status] || STATUS_MAP.NEW;
    return (
      <div>
        <button
          onClick={() => setSelectedMessage(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la liste
        </button>

        {/* Message header */}
        <div className={`border rounded-lg p-5 mb-4 ${statusInfo.bg}`}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{selectedMessage.subject}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className={`text-[10px] ${statusInfo.color}`}>
                  {statusInfo.label}
                </Badge>
                <span className="text-xs text-gray-600">
                  De: <strong>{selectedMessage.sender.name}</strong> ({selectedMessage.sender.email})
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(selectedMessage.createdAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusDialogOpen(true)}
            >
              <Filter className="h-3.5 w-3.5 mr-1.5" />
              Changer statut
            </Button>
          </div>
          <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{selectedMessage.body}</p>
          {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
            <AttachmentDisplay attachments={selectedMessage.attachments} />
          )}
        </div>

        {/* Replies */}
        {selectedMessage.replies && selectedMessage.replies.length > 0 && (
          <div className="space-y-3 mb-4">
            {selectedMessage.replies.map((reply) => {
              const isEmployee = reply.sender.role === "EMPLOYEE";
              return (
                <div
                  key={reply.id}
                  className={`rounded-lg p-4 ${
                    isEmployee
                      ? "bg-gray-50 border border-gray-100 mr-8"
                      : "bg-blue-50 border border-blue-100 ml-8"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs font-medium ${isEmployee ? "text-gray-700" : "text-blue-700"}`}>
                      {reply.sender.name}
                      {!isEmployee && " (RH)"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(reply.createdAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{reply.body}</p>
                  {reply.attachments && reply.attachments.length > 0 && (
                    <AttachmentDisplay attachments={reply.attachments} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Reply form */}
        {selectedMessage.status !== "CLOSED" && (
          <form onSubmit={handleReply} className="bg-white border border-gray-200 rounded-lg p-4">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Écrire une réponse au collaborateur..."
              className="w-full h-28 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-200"
              required
            />
            <div className="flex items-center justify-between mt-2">
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => changeStatus("RESOLVED")}
                >
                  <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                  Marquer traité
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => changeStatus("CLOSED")}
                >
                  <XCircle className="h-3 w-3 mr-1 text-gray-400" />
                  Fermer
                </Button>
              </div>
              <Button type="submit" size="sm" disabled={replyLoading || !replyText.trim()}>
                {replyLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                )}
                Répondre
              </Button>
            </div>
          </form>
        )}

        {/* Status change dialog */}
        <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Changer le statut</DialogTitle>
              <DialogDescription>
                Sélectionnez le nouveau statut de ce message
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {Object.entries(STATUS_MAP).map(([key, info]) => {
                const Icon = info.icon;
                return (
                  <button
                    key={key}
                    onClick={() => changeStatus(key)}
                    disabled={changingStatus === key || selectedMessage.status === key}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                      selectedMessage.status === key
                        ? "border-gray-300 bg-gray-50 opacity-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${info.color.split(" ")[1]}`} />
                    <span className="text-sm font-medium">{info.label}</span>
                    {selectedMessage.status === key && (
                      <Badge variant="secondary" className="ml-auto text-[10px]">Actuel</Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages RH</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Messages des collaborateurs
          </p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Nouveaux", value: stats.new, color: "text-blue-700", bg: "bg-blue-50 border-blue-100", filter: "NEW" },
            { label: "En cours", value: stats.inProgress, color: "text-amber-700", bg: "bg-amber-50 border-amber-100", filter: "IN_PROGRESS" },
            { label: "Traités", value: stats.resolved, color: "text-green-700", bg: "bg-green-50 border-green-100", filter: "RESOLVED" },
            { label: "Fermés", value: stats.closed, color: "text-gray-600", bg: "bg-gray-50 border-gray-100", filter: "CLOSED" },
          ].map((stat) => (
            <button
              key={stat.filter}
              onClick={() => setStatusFilter(statusFilter === stat.filter ? "" : stat.filter)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                statusFilter === stat.filter ? stat.bg + " ring-2 ring-gray-300" : stat.bg
              }`}
            >
              <p className="text-[10px] uppercase font-medium text-gray-500">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>
        {(statusFilter || categoryFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStatusFilter(""); setCategoryFilter(""); }}
          >
            Réinitialiser
          </Button>
        )}
      </div>

      {/* Messages list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : messages.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <Inbox className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">Aucun message</p>
          <p className="text-sm text-gray-400">
            {statusFilter || categoryFilter
              ? "Aucun message ne correspond aux filtres sélectionnés"
              : "Les messages des collaborateurs apparaîtront ici"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => {
            const statusInfo = STATUS_MAP[msg.status] || STATUS_MAP.NEW;
            const StatusIcon = statusInfo.icon;
            const isUnread = msg.status === "NEW" && !msg.readAt;

            return (
              <button
                key={msg.id}
                onClick={() => {
                  setSelectedMessage(msg);
                  setReplyText("");
                }}
                className={`w-full text-left border rounded-lg p-4 transition-colors ${
                  isUnread
                    ? "bg-blue-50/50 border-blue-200 hover:bg-blue-50"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusIcon className={`h-3.5 w-3.5 flex-shrink-0 ${statusInfo.color.split(" ")[1]}`} />
                      <span className={`text-sm truncate ${isUnread ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                        {msg.subject}
                      </span>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <Paperclip className="h-3 w-3 text-gray-400 flex-shrink-0" />
                      )}
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate pl-5">{msg.body}</p>
                    <div className="flex items-center gap-2 mt-1.5 pl-5 flex-wrap">
                      <span className="text-xs font-medium text-gray-600">{msg.sender.name}</span>
                      <Badge variant="outline" className={`text-[10px] ${statusInfo.color}`}>
                        {statusInfo.label}
                      </Badge>
                      {msg._count.replies > 0 && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <MessageSquare className="h-3 w-3" />
                          {msg._count.replies}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">
                        {new Date(msg.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 ml-2 flex-shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
