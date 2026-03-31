"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Eye } from "lucide-react";
import { format } from "date-fns";

interface PrintJobItem {
  productName: string;
  quantity: number;
  price: number | null;
  promoLabel: string | null;
}

interface PrintJob {
  id: string;
  createdAt: string;
  userName: string;
  templateName: string;
  templateType: string;
  totalLabels: number;
  format: string;
  items: PrintJobItem[];
}

export default function PrintHistory() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/labels/print?page=${page}&limit=20`);
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setJobs(data.jobs || []);
      setTotalPages(data.totalPages || 1);
    } catch {
      setError("Impossible de charger l'historique.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy HH:mm");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  Date
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  Utilisateur
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  Template
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  &Eacute;tiquettes
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  Format
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Chargement...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Aucune impression enregistr&eacute;e.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(job.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {job.userName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {job.templateName}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {job.totalLabels}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          job.format === "pdf"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-purple-100 text-purple-700"
                        }`}
                      >
                        {job.format.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedJob(job)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Page {page} sur {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Pr&eacute;c&eacute;dent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedJob}
        onOpenChange={(open) => !open && setSelectedJob(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>D&eacute;tail de l&apos;impression</DialogTitle>
            <DialogDescription>
              {selectedJob && formatDate(selectedJob.createdAt)} &mdash;{" "}
              {selectedJob?.userName}
            </DialogDescription>
          </DialogHeader>

          {selectedJob && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-gray-500">Template</p>
                  <p className="font-medium">{selectedJob.templateName}</p>
                </div>
                <div>
                  <p className="text-gray-500">Format</p>
                  <p className="font-medium">
                    {selectedJob.format.toUpperCase()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Total &eacute;tiquettes</p>
                  <p className="font-medium">{selectedJob.totalLabels}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-3">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Produits
                </p>
                <div className="space-y-2">
                  {selectedJob.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-sm rounded-md bg-gray-50 px-3 py-2"
                    >
                      <div>
                        <span className="font-medium text-gray-900">
                          {item.productName}
                        </span>
                        {item.promoLabel && (
                          <span className="ml-2 text-xs text-red-600 font-medium">
                            {item.promoLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-gray-500">
                        {item.price != null && (
                          <span>{item.price.toFixed(2)} &euro;</span>
                        )}
                        <span className="font-medium text-gray-700">
                          x{item.quantity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
