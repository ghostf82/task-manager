/** Slim global footer — profile and sign-out live in the sidebar. */
export function AppFooter({ tagline }: { tagline: string }) {
  return (
    <footer className="border-t border-gold/10 bg-white/50 px-4 py-2 backdrop-blur-sm">
      <p className="text-center text-[11px] font-light leading-relaxed text-primary/55">
        {tagline}
      </p>
    </footer>
  );
}
