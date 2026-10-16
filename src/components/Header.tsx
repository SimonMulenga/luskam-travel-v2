import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import logo from "@/assets/luskam-logo.jpeg";

const nav = [
  { label: "Flights", to: "/#search", matches: ["/flights"] },
  { label: "Hotels", to: "/hotels", matches: ["/hotels"] },
  { label: "Cars", to: "/cars", matches: ["/cars"] },
  { label: "Visa", to: "/visa", matches: ["/visa"] },
  { label: "Kakande Ministries", to: "/kakande", matches: ["/kakande"] },
  { label: "Blog", to: "/blog", matches: ["/blog"] },
  { label: "About", to: "/#about", matches: ["/about"] },
];

export const Header = () => {
  const { user } = useAuth();
  const { isAgent } = useRoles();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname, location.hash]);

  const linkClass = (active: boolean) =>
    `rounded-full px-3 py-2 text-sm font-medium transition-colors duration-200 ${
      active ? "bg-primary/5 text-primary" : "text-foreground/75 hover:bg-muted hover:text-primary"
    }`;

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/95 shadow-[0_4px_20px_-16px_rgba(12,31,58,.35)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/90">
      <div className="container flex h-[76px] items-center justify-between gap-4">
        <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Luskam Travel Agents home">
          <img src={logo} alt="" className="h-11 w-11 rounded-xl object-cover ring-1 ring-primary/10" width={44} height={44} />
          <div className="min-w-0 leading-tight">
            <div className="truncate font-display text-[15px] font-bold tracking-tight text-primary sm:text-base">Luskam Travel Agents</div>
            <div className="mt-1 text-[10px] font-medium tracking-[.13em] text-muted-foreground">EXPERTS AT ADVENTURE</div>
          </div>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-0.5 xl:flex">
          {nav.map((item) => {
            const active = item.matches.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`)) ||
              (item.to === "/#search" && location.pathname === "/" && location.hash === "#search") ||
              (item.to === "/#about" && location.pathname === "/" && location.hash === "#about");
            return <Link key={item.label} to={item.to} className={linkClass(active)} aria-current={active ? "page" : undefined}>{item.label}</Link>;
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <a href="tel:+260773918145" className="hidden text-sm font-semibold text-primary transition-colors hover:text-accent 2xl:block">+260 773 918 145</a>
          {isAgent && <Link to="/admin" className="rounded-full bg-primary/5 px-3.5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10">Admin</Link>}
          <Link to={user ? "/account" : "/auth"} className="rounded-full border border-primary/15 px-4 py-2 text-sm font-semibold text-primary transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground">
            {user ? "My account" : "Sign in"}
          </Link>
        </div>

        <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:hidden" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {menuOpen && (
        <div id="mobile-navigation" className="border-t border-border bg-background px-4 pb-5 pt-3 shadow-lg xl:hidden">
          <nav aria-label="Mobile navigation" className="container flex flex-col gap-1">
            {nav.map((item) => {
              const active = item.matches.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`)) ||
                (item.to === "/#search" && location.pathname === "/" && location.hash === "#search") ||
                (item.to === "/#about" && location.pathname === "/" && location.hash === "#about");
              return <Link key={item.label} to={item.to} className={`${linkClass(active)} rounded-xl px-4 py-3`} aria-current={active ? "page" : undefined}>{item.label}</Link>;
            })}
            <div className="mt-2 grid grid-cols-1 gap-2 border-t border-border pt-4 sm:grid-cols-2">
              {isAgent && <Link to="/admin" className="rounded-xl bg-primary/5 px-4 py-3 text-sm font-semibold text-primary">Admin dashboard</Link>}
              <Link to={user ? "/account" : "/auth"} className="rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground">{user ? "My account" : "Sign in"}</Link>
              <a href="tel:+260773918145" className="rounded-xl border border-border px-4 py-3 text-sm font-semibold text-primary">Call +260 773 918 145</a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};
