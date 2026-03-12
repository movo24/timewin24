"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Calendar,
  Store,
  Users,
  FileText,
  LogOut,
  Menu,
  X,
  Euro,
  Shield,
  Plug,
  MessageSquare,
  Megaphone,
  Newspaper,
  ScanLine,
  AlertTriangle,
  UserCheck,
  ArrowLeftRight,
  ShoppingBag,
  BookOpen,
  Bell,
  BellRing,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { useState } from "react";
import { isAdminOrManager, isEmployee as isEmployeeRole, getLoginPageForRole, ROLE_LABELS } from "@/lib/rbac";

const adminLinks = [
  { href: "/planning", label: "Planning", icon: Calendar },
  { href: "/pointages", label: "Pointages", icon: ScanLine },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/alertes", label: "Alertes", icon: Bell },
  { href: "/absences", label: "Absences", icon: AlertTriangle },
  { href: "/remplacements", label: "Remplacements", icon: UserCheck },
  { href: "/echanges", label: "Échanges", icon: ArrowLeftRight },
  { href: "/stores", label: "Magasins", icon: Store },
  { href: "/employees", label: "Employés", icon: Users },
  { href: "/accounts", label: "Comptes", icon: Shield },
  { href: "/messages", label: "Messages RH", icon: MessageSquare },
  { href: "/fil-actualite", label: "Fil d'actualité", icon: Newspaper },
  { href: "/annonces", label: "Annonces", icon: Megaphone },
  { href: "/notifications", label: "Notifications", icon: BellRing },
  { href: "/integrations", label: "Intégrations", icon: Plug },
  { href: "/costs", label: "Coûts", icon: Euro },
  { href: "/audit", label: "Audit", icon: FileText },
];

const managerLinks = [
  { href: "/planning", label: "Planning", icon: Calendar },
  { href: "/pointages", label: "Pointages", icon: ScanLine },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/alertes", label: "Alertes", icon: Bell },
  { href: "/absences", label: "Absences", icon: AlertTriangle },
  { href: "/remplacements", label: "Remplacements", icon: UserCheck },
  { href: "/echanges", label: "Échanges", icon: ArrowLeftRight },
  { href: "/employees", label: "Employés", icon: Users },
  { href: "/messages", label: "Messages RH", icon: MessageSquare },
  { href: "/notifications", label: "Notifications", icon: BellRing },
  { href: "/fil-actualite", label: "Fil d'actualité", icon: Newspaper },
  { href: "/annonces", label: "Annonces", icon: Megaphone },
];

const employeeLinks = [
  { href: "/mon-planning", label: "Mon Planning", icon: Calendar },
  { href: "/pointage", label: "Pointage", icon: ScanLine },
  { href: "/mes-absences", label: "Mes Absences", icon: AlertTriangle },
  { href: "/mes-remplacements", label: "Remplacements", icon: UserCheck },
  { href: "/marche-shifts", label: "Marché Shifts", icon: ShoppingBag },
  { href: "/mes-messages", label: "Mes Messages", icon: MessageSquare },
  { href: "/mes-notifications", label: "Notifications", icon: BellRing },
  { href: "/fil-actualite", label: "Fil d'actualité", icon: Newspaper },
  { href: "/annonces", label: "Annonces", icon: Megaphone },
];

// ROLE_LABELS importé depuis rbac.ts

export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!session) return null;

  const role = session.user.role;
  const links =
    role === "ADMIN"
      ? adminLinks
      : role === "MANAGER"
      ? managerLinks
      : employeeLinks;

  const nav = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">TimeWin</h1>
            <p className="text-xs text-gray-500 mt-0.5">The Wesley — Gestion RH</p>
          </div>
          {(role === "ADMIN" || role === "MANAGER") && <NotificationBell />}
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-200">
        <div className="px-3 py-2 text-sm">
          <p className="font-medium text-gray-900">{session.user.name}</p>
          <p className="text-xs text-gray-500">{session.user.email}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role}
          </p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 mt-1 text-gray-600"
          onClick={() => signOut({ callbackUrl: getLoginPageForRole(role) })}
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-full w-60 bg-white border-r border-gray-200 transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {nav}
      </aside>
    </>
  );
}
