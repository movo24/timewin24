import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card primitive UI (shadcn-style).
 *
 * Aucune logique, aucun state, aucun "use client". Pure wrapper Tailwind
 * autour de div/h3 avec forwardRef. Réutilisable côté Server ou Client.
 *
 * Usage :
 *   <Card>
 *     <CardHeader>
 *       <CardTitle>Titre du KPI</CardTitle>
 *     </CardHeader>
 *     <CardContent>
 *       <p className="text-2xl font-bold">42</p>
 *     </CardContent>
 *   </Card>
 *
 * Compatible avec le pattern shadcn standard. Si on veut ajouter
 * CardFooter ou CardDescription plus tard, c'est le même squelette.
 */

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-gray-200 bg-white shadow-sm",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1 px-4 pt-4 pb-2", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-sm font-medium text-gray-500 leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("px-4 pb-4", className)} {...props} />
));
CardContent.displayName = "CardContent";

export { Card, CardHeader, CardTitle, CardContent };
