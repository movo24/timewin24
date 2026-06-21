"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
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
  Tag,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { useState } from "react";
import { getLoginPageForRole, ROLE_LABELS } from "@/lib/rbac";

// ── Types ────────────────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

// ── Navigation admin (groupée par étage) ────────────────────────────

const adminNavGroups: NavGroup[] = [
  {
    label: "",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    ],
  },
  {
    label: "Opérations",
    items: [
      { href: "/stores", label: "Magasins", icon: Store },
      { href: "/employees", label: "Employés", icon: Users },
    ],
  },
  {
    label: "Quotidien",
    items: [
      { href: "/planning", label: "Planning", icon: Calendar },
      { href: "/pointages", label: "Pointages", icon: ScanLine },
      { href: "/journal", label: "Journal", icon: BookOpen },
      { href: "/absences", label: "Absences", icon: AlertTriangle },
      { href: "/remplacements", label: "Remplacements", icon: UserCheck },
      { href: "/echanges", label: "Échanges", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Analyse",
    items: [
      { href: "/performance", label: "Performance", icon: BarChart3 },
      { href: "/costs", label: "Coûts", icon: Euro },
      { href: "/alertes", label: "Alertes", icon: Bell },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/messages", label: "Messages RH", icon: MessageSquare },
      { href: "/annonces", label: "Annonces", icon: Megaphone },
      { href: "/fil-actualite", label: "Fil d'actualité", icon: Newspaper },
      { href: "/notifications", label: "Notifications", icon: BellRing },
    ],
  },
  {
    label: "Système",
    items: [
      { href: "/etiquettes", label: "Étiquettes", icon: Tag },
      { href: "/accounts", label: "Comptes", icon: Shield },
      { href: "/integrations", label: "Intégrations", icon: Plug },
      { href: "/audit", label: "Audit", icon: FileText },
    ],
  },
];

// Pour manager : idem sans les menus système sensibles
const managerNavGroups: NavGroup[] = [
  {
    label: "",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    ],
  },
  {
    label: "Opérations",
    items: [
      { href: "/employees", label: "Employés", icon: Users },
    ],
  },
  {
    label: "Quotidien",
    items: [
      { href: "/planning", label: "Planning", icon: Calendar },
      { href: "/pointages", label: "Pointages", icon: ScanLine },
      { href: "/journal", label: "Journal", icon: BookOpen },
      { href: "/absences", label: "Absences", icon: AlertTriangle },
      { href: "/remplacements", label: "Remplacements", icon: UserCheck },
      { href: "/echanges", label: "Échanges", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Analyse",
    items: [
      { href: "/performance", label: "Performance", icon: BarChart3 },
      { href: "/alertes", label: "Alertes", icon: Bell },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/messages", label: "Messages RH", icon: MessageSquare },
      { href: "/annonces", label: "Annonces", icon: Megaphone },
      { href: "/fil-actualite", label: "Fil d'actualité", icon: Newspaper },
      { href: "/notifications", label: "Notifications", icon: BellRing },
    ],
  },
  {
    label: "Outils",
    items: [
      { href: "/etiquettes", label: "Étiquettes", icon: Tag },
    ],
  },
];

// Navigation employé (liste plate — reste inchangée)
const employeeLinks: NavItem[] = [
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

// ── Composant NavGroup ───────────────────────────────────────────────

function NavGroupBlock({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="space-y-0.5">
      {group.label && (
        <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {group.label}
        </p>
      )}
      {group.items.map((link) => {
        const Icon = link.icon;
        const active = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href));
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-gray-100 text-gray-900"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}

// ── Composant Sidebar ────────────────────────────────────────────────

export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!session) return null;

  const role = session.user.role;
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const isManager = role === "MANAGER";
  const isEmployee = role === "EMPLOYEE";

  const nav = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">TimeWin</h1>
            <p className="text-xs text-gray-500 mt-0.5">Gestion RH & Planning</p>
          </div>
          {(isAdmin || isManager) && <NotificationBell />}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3">
        {isEmployee ? (
          // Employé : liste plate
          <div className="space-y-0.5">
            {employeeLinks.map((link) => {
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
                  <Icon className="h-4 w-4 shrink-0" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        ) : (
          // Admin / Manager : navigation par groupes
          <div className="space-y-1">
            {(isAdmin ? adminNavGroups : managerNavGroups).map((group, i) => (
              <NavGroupBlock
                key={i}
                group={group}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </div>
        )}
      </nav>

      {/* Footer utilisateur */}
      <div className="p-3 border-t border-gray-200">
        <div className="px-3 py-2 text-sm">
          <p className="font-medium text-gray-900 truncate">{session.user.name}</p>
          <p className="text-xs text-gray-500 truncate">{session.user.email}</p>
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
      {/* Bouton mobile */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Overlay mobile */}
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
