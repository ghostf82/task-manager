/** Slim global footer — profile and sign-out live in the sidebar. */
export function AppFooter({ tagline }: { tagline: string }) {
  return (
    <footer className="border-t border-border/70 bg-muted/10 px-4 py-2">
      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">{tagline}</p>
    </footer>
  );
}
