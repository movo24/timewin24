"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  MessageSquarePlus,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  ChevronRight,
  ArrowLeft,
  MessageCircle,
  Loader2,
  Paperclip,
} from "lucide-react";
import { FileUpload } from "@/components/ui/file-upload";
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
  createdAt: string;
  readAt: string | null;
  resolvedAt: string | null;
  handler: { id: string; name: string } | null;
  replies: Reply[];
  attachments?: Attachment[];
  _count: { replies: number };
}

interface UploadedFile {
  filename: string;
  path: string;
  mimeType: string;
  size: number;
}

const CATEGORIES = [
  { value: "GENERAL", label: "Question générale" },
  { value: "PLANNING", label: "Planning" },
  { value: "CONGE", label: "Demande de congé" },
  { value: "ABSENCE", label: "Signalement absence" },
  { value: "ADMINISTRATIF", label: "Administratif" },
  { value: "RECLAMATION", label: "Réclamation" },
  { value: "AUTRE", label: "Autre" },
];

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  NEW: { label: "Envoyé", color: "bg-blue-100 text-blue-700", icon: Clock },
  IN_PROGRESS: { label: "En cours", color: "bg-amber-100 text-amber-700", icon: AlertCircle },
  RESOLVED: { label: "Traité", color: "bg-green-100 text-green-700", icon: CheckCircle },
  CLOSED: { label: "Fermé", color: "bg-gray-100 text-gray-600", icon: XCircle },
};

export default function MesMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Create form
  const [form, setForm] = useState({ subject: "", body: "", category: "GENERAL" });
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // Reply
  const [replyText, setReplyText] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/messages");
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreateLoading(true);

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error || "Erreur");
        setCreateLoading(false);
        return;
      }

      setCreateOpen(false);
      setForm({ subject: "", body: "", category: "GENERAL" });
      setUploadedFiles([]);
      loadMessages();
    } catch {
      setCreateError("Erreur réseau");
    }
    setCreateLoading(false);
  }

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
        // Recharger le message avec les nouvelles réponses
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

  function openMessage(msg: Message) {
    setSelectedMessage(msg);
    setReplyText("");
  }

  // Detail view
  if (selectedMessage) {
    const statusInfo = STATUS_MAP[selectedMessage.status] || STATUS_MAP.NEW;
    return (
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => setSelectedMessage(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux messages
        </button>

        {/* Message principal */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{selectedMessage.subject}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={`text-[10px] ${statusInfo.color}`}>
                  {statusInfo.label}
                </Badge>
                <span className="text-xs text-gray-400">
                  {CATEGORIES.find((c) => c.value === selectedMessage.category)?.label}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(selectedMessage.createdAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
            {selectedMessage.handler && (
              <span className="text-xs text-gray-400">
                Suivi par: {selectedMessage.handler.name}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedMessage.body}</p>
          {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
            <AttachmentDisplay attachments={selectedMessage.attachments} />
          )}
        </div>

        {/* Réponses */}
        {selectedMessage.replies && selectedMessage.replies.length > 0 && (
          <div className="space-y-3 mb-4">
            {selectedMessage.replies.map((reply) => {
              const isHr = reply.sender.role !== "EMPLOYEE";
              return (
                <div
                  key={reply.id}
                  className={`rounded-lg p-4 ${
                    isHr
                      ? "bg-blue-50 border border-blue-100 ml-4"
                      : "bg-gray-50 border border-gray-100 mr-4"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs font-medium ${isHr ? "text-blue-700" : "text-gray-700"}`}>
                      {isHr ? `${reply.sender.name} (RH)` : "Vous"}
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

        {/* Répondre (seulement si pas fermé) */}
        {selectedMessage.status !== "CLOSED" && (
          <form onSubmit={handleReply} className="bg-white border border-gray-200 rounded-lg p-4">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Écrire une réponse..."
              className="w-full h-24 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-200"
              required
            />
            <div className="flex justify-end mt-2">
              <Button type="submit" size="sm" disabled={replyLoading || !replyText.trim()}>
                {replyLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                )}
                Envoyer
              </Button>
            </div>
          </form>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Messages</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Communication avec le service RH
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <MessageSquarePlus className="h-4 w-4 mr-2" />
          Contacter RH
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : messages.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <MessageCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">Aucun message</p>
          <p className="text-sm text-gray-400 mb-4">
            Vous pouvez contacter le service RH pour toute question
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            Contacter RH
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => {
            const statusInfo = STATUS_MAP[msg.status] || STATUS_MAP.NEW;
            const StatusIcon = statusInfo.icon;
            const hasNewReply = msg.replies?.some(
              (r) => r.sender.role !== "EMPLOYEE" && new Date(r.createdAt) > new Date(msg.createdAt)
            );

            return (
              <button
                key={msg.id}
                onClick={() => openMessage(msg)}
                className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusIcon className={`h-3.5 w-3.5 ${statusInfo.color.split(" ")[1]}`} />
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {msg.subject}
                      </span>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <Paperclip className="h-3 w-3 text-gray-400" />
                      )}
                      {hasNewReply && (
                        <Badge className="text-[10px] bg-blue-500 text-white border-0">
                          Nouvelle réponse
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{msg.body}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline" className={`text-[10px] ${statusInfo.color}`}>
                        {statusInfo.label}
                      </Badge>
                      <span className="text-[10px] text-gray-400">
                        {CATEGORIES.find((c) => c.value === msg.category)?.label}
                      </span>
                      {msg._count.replies > 0 && (
                        <span className="text-[10px] text-gray-400">
                          {msg._count.replies} réponse(s)
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">
                        {new Date(msg.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Contacter le service RH</DialogTitle>
            <DialogDescription>
              Envoyez un message au service des ressources humaines
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Catégorie</Label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Objet *</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Ex: Demande de congé semaine 12"
                required
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label>Message *</Label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Décrivez votre demande..."
                className="w-full h-32 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-200"
                required
                maxLength={5000}
              />
              <p className="text-[10px] text-gray-400 text-right">
                {form.body.length}/5000
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" />
                Pièces jointes
              </Label>
              <FileUpload
                onFilesUploaded={setUploadedFiles}
                maxFiles={5}
              />
            </div>

            {createError && <p className="text-sm text-red-600">{createError}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={createLoading}>
                {createLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Envoyer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
