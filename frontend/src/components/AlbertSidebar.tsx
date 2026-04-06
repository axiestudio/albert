import {
  ChevronDown,
  ChevronRight,
  History,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AlbertThread } from '@/lib/albert-history';
import { getStoredAlbertHistoryCollapsed, setStoredAlbertHistoryCollapsed } from '@/lib/albert-history';
import { cn } from '@/lib/utils';

type AlbertSidebarProps = {
  collapsed: boolean;
  currentThreadId: string;
  loading: boolean;
  onDeleteThread: (threadId: string) => void;
  onNewChat: () => void;
  onSelectThread: (threadId: string) => void;
  onToggleSidebar: () => void;
  open: boolean;
  threads: AlbertThread[];
};

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Inga sparade konversationer ännu</p>
      <p className="mt-1 leading-relaxed">
        Starta en chatt så sparar Albert den i din historik.
      </p>
    </div>
  );
}

export function AlbertSidebar({
  collapsed,
  currentThreadId,
  loading,
  onDeleteThread,
  onNewChat,
  onSelectThread,
  onToggleSidebar,
  open,
  threads,
}: AlbertSidebarProps) {
  const [historyCollapsed, setHistoryCollapsed] = useState(false);

  useEffect(() => {
    setHistoryCollapsed(getStoredAlbertHistoryCollapsed());
  }, []);

  const toggleHistoryCollapsed = () => {
    setHistoryCollapsed((current) => {
      const next = !current;
      setStoredAlbertHistoryCollapsed(next);
      return next;
    });
  };

  return (
    <aside
      data-desktop-state={collapsed ? 'collapsed' : 'expanded'}
      data-mobile-state={open ? 'open' : 'closed'}
      className={cn(
        'fixed inset-y-0 left-0 z-50 w-[min(88vw,22rem)] border-r border-border/60 bg-background transition-[width,transform,box-shadow] duration-200 ease-out',
        'overflow-y-auto shadow-2xl',
        open ? 'translate-x-0' : '-translate-x-full pointer-events-none',
        'md:static md:z-auto md:translate-x-0 md:pointer-events-auto md:overflow-hidden md:bg-muted/20 md:shadow-none',
        collapsed ? 'md:w-[4.75rem]' : 'md:w-80',
      )}
    >
      <div
        className={cn(
          'hidden h-full flex-col items-center gap-3 px-3 py-4 md:flex',
          collapsed ? 'md:flex' : 'md:hidden',
        )}
      >
        <button
          type="button"
          onClick={onToggleSidebar}
          className="inline-flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background text-foreground shadow-sm transition-colors hover:bg-accent"
          aria-label="Expandera sidopanel"
          title="Expandera sidopanel"
        >
          <PanelLeftOpen className="size-4.5" />
        </button>

        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          aria-label="Ny chatt"
          title="Ny chatt"
        >
          <MessageSquarePlus className="size-4.5" />
        </button>

        <button
          type="button"
          onClick={onToggleSidebar}
          className="relative inline-flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Senaste konversationer"
          title="Senaste konversationer"
        >
          <History className="size-4.5" />
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
            {threads.length}
          </span>
        </button>

        <div className="mt-auto flex w-full flex-col items-center gap-2">
          <div className="inline-flex size-11 items-center justify-center rounded-2xl border border-border/70 bg-background text-foreground shadow-sm">
            <UserRound className="size-4.5" />
          </div>
          <span className="text-center text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Local
          </span>
        </div>
      </div>

      <div className={cn('flex h-full flex-col gap-4 p-4', collapsed && 'md:hidden')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Albert</p>
            <h2 className="text-base font-semibold text-foreground">Konversationshistorik</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNewChat}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <MessageSquarePlus className="size-3.5" />
              Ny chatt
            </button>
            <button
              type="button"
              onClick={onToggleSidebar}
              className="inline-flex size-9 items-center justify-center rounded-xl border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={open ? 'Stäng sidopanel' : 'Fäll ihop sidopanel'}
              title={open ? 'Stäng sidopanel' : 'Fäll ihop sidopanel'}
            >
              <PanelLeftClose className="hidden size-4 md:block" />
              <X className="size-4 md:hidden" />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border bg-background/90 p-3 text-sm">
          <div className="flex items-center gap-2 text-foreground">
            <UserRound className="size-4" />
            <span className="font-medium">Lokal lagring</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Konversationer sparas lokalt i din webbläsare.
          </p>
        </div>

        <button
          type="button"
          onClick={toggleHistoryCollapsed}
          className="flex items-center justify-between gap-2 rounded-xl px-2 py-1 text-left text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:bg-accent/40"
          aria-expanded={!historyCollapsed}
        >
          <span className="flex items-center gap-2">
            <History className="size-3.5" />
            Senaste
          </span>
          <span className="flex items-center gap-2">
            <span className="text-[10px] tracking-normal normal-case">{threads.length}</span>
            {historyCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </span>
        </button>

        {!historyCollapsed && (
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {threads.length === 0 ? (
              <EmptyState />
            ) : (
              threads.map((thread) => (
                <div
                  key={thread.id}
                  className={cn(
                    'group rounded-2xl border bg-background/80 p-3 transition-colors hover:bg-accent/30',
                    thread.id === currentThreadId && 'border-primary/40 bg-primary/5',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectThread(thread.id)}
                    className="w-full text-left"
                    disabled={loading}
                  >
                    <div className="truncate text-sm font-medium text-foreground">{thread.title}</div>
                    <div className="mt-1 line-clamp-2 min-h-9 text-xs leading-relaxed text-muted-foreground">
                      {thread.preview || 'Ännu ingen förhandsgranskning'}
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {thread.messageCount} meddelanden
                    </div>
                  </button>

                  <div className="mt-2 flex justify-end opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => onDeleteThread(thread.id)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                      Radera
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
