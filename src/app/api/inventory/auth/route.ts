import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signInventoryToken } from "@/lib/inventory-jwt";

// POST /api/inventory/auth
// Login inventaire mobile : employeeIdentifier + storeIdentifier + password
// Vérifie les 6 règles métier avant de délivrer un JWT inventory
export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Corps JSON invalide (objet attendu)" }, { status: 400 });
      }
      body = parsed;
    } catch {
      return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
    }
    const { employeeIdentifier, storeIdentifier, password } = body;

    if (!employeeIdentifier || !storeIdentifier || !password) {
      return NextResponse.json(
        { error: "employeeIdentifier, storeIdentifier et password requis" },
        { status: 400 }
      );
    }

    // 1. Trouver l'employé (par email ou employeeCode)
    const employee = await prisma.employee.findFirst({
      where: {
        OR: [
          { email: employeeIdentifier },
          { employeeCode: employeeIdentifier },
        ],
      },
      include: {
        user: true,
        stores: { select: { storeId: true } },
      },
    });

    if (!employee || !employee.user) {
      return NextResponse.json(
        { error: "Employé introuvable" },
        { status: 401 }
      );
    }

    // 2. Vérifier le mot de passe
    const passwordValid = employee.user?.passwordHash
      ? await (bcrypt.compare as any)(String(password), String(employee.user.passwordHash))
      : false;
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Mot de passe incorrect" },
        { status: 401 }
      );
    }

    // 3. Vérifier que l'employé est actif
    if (!employee.active || !employee.user.active) {
      return NextResponse.json(
        { error: "Employé désactivé. Contactez votre administrateur." },
        { status: 403 }
      );
    }

    // 4. Trouver le magasin (par storeCode ou id)
    const store = await prisma.store.findFirst({
      where: {
        OR: [
          { storeCode: storeIdentifier },
          { id: storeIdentifier },
        ],
      },
    });

    if (!store) {
      return NextResponse.json(
        { error: "Magasin introuvable" },
        { status: 404 }
      );
    }

    // 5. Vérifier que le magasin est actif
    if (store.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Magasin inactif" },
        { status: 403 }
      );
    }

    // 6. Vérifier que l'employé est affecté à ce magasin
    const allowedStoreIds = employee.stores.map((s) => s.storeId);
    if (!allowedStoreIds.includes(store.id)) {
      return NextResponse.json(
        { error: "Employé non autorisé sur ce magasin" },
        { status: 403 }
      );
    }

    // Toutes les vérifications passées → JWT inventory
    const token = await signInventoryToken({
      employeeId: employee.id,
      storeId: store.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      storeName: store.name,
      role: "inventory",
    });

    return NextResponse.json({
      token,
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
      },
      store: {
        id: store.id,
        name: store.name,
        storeCode: store.storeCode,
        city: store.city,
      },
    });
  } catch (err) {
    console.error("POST /api/inventory/auth error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
