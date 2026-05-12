/** Slim global footer — profile and sign-out live in the sidebar. */
export function AppFooter({ tagline }: { tagline: string }) {
  return (
    <footer className="border-t border-gold/10 bg-white/50 px-4 py-2 backdrop-blur-sm">
      <p className="whitespace-pre-line text-center text-[11px] leading-relaxed text-muted-foreground">
        {tagline}
      </p>
    </footer>
  );
}
