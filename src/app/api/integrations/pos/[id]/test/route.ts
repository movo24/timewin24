import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { createPosAdapter } from "@/lib/pos/factory";
import type { PosProviderConfig } from "@/lib/pos/types";

// POST /api/integrations/pos/[id]/test — Teste la connexion POS
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    const provider = await prisma.posProvider.findUnique({ where: { id } });
    if (!provider) return errorResponse("Provider introuvable", 404);

    try {
    const config: PosProviderConfig = {
      id: provider.id,
      type: provider.type,
      apiUrl: provider.apiUrl,
      apiKey: provider.apiKey,
      apiSecret: provider.apiSecret,
      accessToken: provider.accessToken,
      refreshToken: provider.refreshToken,
      tokenExpiresAt: provider.tokenExpiresAt,
      config: provider.config,
    };

    const adapter = await createPosAdapter(config);
    const startTime = Date.now();
    const connected = await adapter.testConnection();
    const durationMs = Date.now() - startTime;

    // Essayer aussi de récupérer les magasins POS pour donner du contexte
    let posStores: { posId: string; name: string }[] = [];
    let posEmployees: { posId: string; name: string }[] = [];

    if (connected) {
      try {
        const stores = await adapter.fetchStores();
        posStores = stores.map((s) => ({ posId: s.posId, name: s.name }));
      } catch { /* ignore */ }

      try {
        const employees = await adapter.fetchEmployees();
        posEmployees = employees.map((e) => ({ posId: e.posId, name: e.name }));
      } catch { /* ignore */ }
    }

    return successResponse({
      connected,
      durationMs,
      provider: {
        name: adapter.providerName,
        type: provider.type,
      },
      posStores,
      posEmployees,
    });
    } catch (err) {
      return successResponse({
        connected: false,
        error: "Erreur de connexion",
      });
    }
  } catch (err) {
    console.error("POST /api/integrations/pos/[id]/test error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}
