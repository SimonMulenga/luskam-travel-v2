import { useState } from "react";
import { Phone, MessageCircle, Facebook, X, MessagesSquare } from "lucide-react";

const actions = [
  {
    label: "WhatsApp · 773 918 145",
    href: "https://wa.me/260773918145?text=Hello%20Luskam%20Travel%20Agents%2C%20I%20would%20like%20to%20enquire%20about%20a%20booking.",
    icon: MessageCircle,
    className: "bg-[#25D366] hover:bg-[#1ebe5d] text-white",
    external: true,
  },
  {
    label: "WhatsApp · 976 652 877",
    href: "https://wa.me/260976652877?text=Hello%20Luskam%20Travel%20Agents%2C%20I%20would%20like%20to%20enquire%20about%20a%20booking.",
    icon: MessageCircle,
    className: "bg-[#25D366] hover:bg-[#1ebe5d] text-white",
    external: true,
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/luskamtravelagents",
    icon: Facebook,
    className: "bg-[#1877F2] hover:bg-[#1466d1] text-white",
    external: true,
  },
  {
    label: "Call · 979 450 446",
    href: "tel:+260979450446",
    icon: Phone,
    className: "bg-primary hover:bg-primary/90 text-primary-foreground",
    external: false,
  },
];

export const FloatingContact = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex flex-col items-end gap-2">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <a
                key={a.label}
                href={a.href}
                target={a.external ? "_blank" : undefined}
                rel={a.external ? "noreferrer noopener" : undefined}
                aria-label={a.label}
                className={`group flex items-center gap-2 rounded-full px-3 py-2 shadow-md transition-transform hover:-translate-y-0.5 ${a.className}`}
              >
                <span className="hidden text-xs font-semibold sm:inline">{a.label}</span>
                <Icon className="h-5 w-5" />
              </a>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close contact menu" : "Open contact menu"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        {open ? <X className="h-6 w-6" /> : <MessagesSquare className="h-6 w-6" />}
      </button>
    </div>
  );
};
