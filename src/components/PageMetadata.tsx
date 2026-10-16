import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applyPageMetadata, type PageMetadataInput } from "@/lib/pageMetadata";

const PUBLIC_PAGES: Record<string, Omit<PageMetadataInput, "path">> = {
  "/": {
    title: "Luskam Travel Agents | Flights and Travel Services",
    description: "Search flights and explore accommodation ideas, car hire, visa guidance, and Kakande Ministries group travel with Luskam Travel Agents.",
  },
  "/flights": {
    title: "Search Flights | Luskam Travel Agents",
    description: "Search flight schedules and available fares by route, dates, passenger count, and cabin class.",
  },
  "/hotels": {
    title: "Accommodation Ideas | Luskam Travel Agents",
    description: "Explore accommodation examples and send a stay inquiry. Availability and final pricing are confirmed by the travel team.",
  },
  "/cars": {
    title: "Car Hire Options | Luskam Travel Agents",
    description: "Browse car hire examples and request a vehicle. Availability and final pricing are confirmed by the travel team.",
  },
  "/visa": {
    title: "Visa Guidance | Luskam Travel Agents",
    description: "Send a visa guidance inquiry. Requirements, fees, timing, and decisions are set by the relevant authorities.",
  },
  "/kakande": {
    title: "Kakande Ministries Travel Programme",
    description: "View Kakande Ministries group travel programme details and submit a reservation inquiry.",
  },
  "/blog": {
    title: "Travel News and Tips | Luskam Travel Agents",
    description: "Read travel articles and guidance published by Luskam Travel Agents.",
  },
};

const PRIVATE_PATHS = new Set(["/auth", "/checkout", "/account", "/admin"]);

export const PageMetadata = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const page = PUBLIC_PAGES[pathname];
    if (page) {
      applyPageMetadata({ ...page, path: pathname });
      return;
    }

    if (pathname.startsWith("/blog/")) {
      applyPageMetadata({
        title: "Travel Article | Luskam Travel Agents",
        description: "Read a travel article published by Luskam Travel Agents.",
        path: pathname,
        type: "article",
      });
      return;
    }

    applyPageMetadata({
      title: PRIVATE_PATHS.has(pathname) ? "Customer Portal | Luskam Travel Agents" : "Page Not Found | Luskam Travel Agents",
      description: "Luskam Travel Agents customer and travel services.",
      path: pathname,
      indexable: false,
    });
  }, [pathname]);

  return null;
};
