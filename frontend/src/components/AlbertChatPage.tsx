import { useEffect, useState } from "react";
import { AlbertChatApp } from "@/components/AlbertChatApp";
import { buildAlbertThreadPath } from "@/lib/albert-history";

function readThreadIdFromLocation(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const match = window.location.pathname.match(/^\/chat\/(.+)$/);
  if (!match) {
    return null;
  }

  return decodeURIComponent(match[1]);
}

export function AlbertChatPage({ initialThreadId }: { initialThreadId: string }) {
  const [threadId, setThreadId] = useState(initialThreadId);

  useEffect(() => {
    const syncThreadId = () => {
      setThreadId(readThreadIdFromLocation() ?? initialThreadId);
    };

    syncThreadId();
    window.addEventListener("popstate", syncThreadId);

    return () => {
      window.removeEventListener("popstate", syncThreadId);
    };
  }, [initialThreadId]);

  const navigateToThread = (nextThreadId: string, options?: { replace?: boolean }) => {
    if (typeof window === "undefined") {
      return;
    }

    const nextPath = buildAlbertThreadPath(nextThreadId);
    if (options?.replace) {
      window.history.replaceState({}, "", nextPath);
    } else {
      window.history.pushState({}, "", nextPath);
    }

    setThreadId(nextThreadId);
  };

  return <AlbertChatApp navigateToThread={navigateToThread} routeThreadId={threadId} />;
}