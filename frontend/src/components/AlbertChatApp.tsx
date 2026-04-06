import {
  AssistantRuntimeProvider,
  AuiProvider,
  Suggestions,
  useAui,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlbertSidebar } from "@/components/AlbertSidebar";
import { AlbertSupermemorySettings } from "@/components/AlbertSupermemorySettings";
import { BrowserUseSettings } from "@/components/BrowserUseSettings";
import { Canvas } from "@/components/canvas";
import { ChatHeader } from "@/components/ChatHeader";
import { LawLlmSettings } from "@/components/LawLlmSettings";
import { MyThread } from "@/components/MyThread";
import { useAlbertHistory } from "@/hooks/useAlbertHistory";
import { useGeolocation } from "@/hooks/useGeolocation";
import {
  createNewThreadId,
  getStoredAlbertSidebarCollapsed,
  setStoredAlbertSidebarCollapsed,
} from "@/lib/albert-history";
import { LawAgentChatTransport } from "@/lib/law-agent-chat-transport";
import {
  buildLawLlmHeaders,
  isByokLawLlmMode,
  isLawLlmModeConfigured,
  isVertexLawLlmMode,
  type LawLlmMode,
} from "@/lib/law-llm";
import { buildWebResearchHeaders } from "@/lib/web-research";
import { useAlbertSupermemoryStore } from "@/stores/albert-supermemory-store";
import { useBrowserUseStore } from "@/stores/browser-use-store";
import { useComposerActionsStore } from "@/stores/composer-actions-store";
import { getLawLlmByokApiKey, useLawLlmByokStore } from "@/stores/law-llm-byok-store";
import { useLawLlmStore } from "@/stores/law-llm-store";

type NavigateToThread = (threadId: string, options?: { replace?: boolean }) => void;

function isDesktopViewport(): boolean {
  if (typeof globalThis.matchMedia !== "function") {
    return false;
  }

  return globalThis.matchMedia("(min-width: 768px)").matches;
}

function ThreadWithSuggestions() {
  const aui = useAui({
    suggestions: Suggestions([
      {
        title: "LAS i klarspråk",
        label: "uppsägning och styrande paragrafer",
        prompt:
          "Förklara LAS i klarspråk. Vad säger lagen om uppsägning av personliga skäl, vilka paragrafer styr och vilka caveats ska jag tänka på?",
      },
      {
        title: "GDPR för SaaS",
        label: "svenska regler och förarbeten",
        prompt:
          "Which Swedish rules implement GDPR for a SaaS product handling customer data? Cite the relevant SFS numbers, explain them in plain language first, and include the key preparatory works.",
      },
      {
        title: "Lagstiftningskedja",
        label: "Arbetsmiljölagen",
        prompt:
          "Spåra lagstiftningskedjan bakom Arbetsmiljölagen och sammanfatta syftet med propositionen, de viktigaste rättskällorna och eventuella tolkningsrisker.",
      },
    ]),
  });

  return (
    <AuiProvider value={aui}>
      <MyThread />
    </AuiProvider>
  );
}



function AlbertRuntimeShell({
  currentThreadId,
  initialMessages,
  onLawModeChange,
  onNewChat,
  onOpenLawLlmSettings,
  onOpenResearchSettings,
  onSignOut,
  onPersistThread,
  onOpenSupermemorySettings,
  sessionAuthenticated,
  signingOut,
  onToggleHistory,
}: {
  currentThreadId: string;
  initialMessages: UIMessage[];
  onLawModeChange: (mode: LawLlmMode) => void;
  onNewChat: () => void;
  onOpenLawLlmSettings: () => void;
  onOpenResearchSettings?: () => void;
  onSignOut?: () => void;
  onPersistThread: (threadId: string, messages: UIMessage[]) => Promise<void> | void;
  onOpenSupermemorySettings?: () => void;
  sessionAuthenticated: boolean;
  signingOut: boolean;
  onToggleHistory: () => void;
}) {
  const browserUseEnabled = useBrowserUseStore((state) => state.enabled);
  const browserUseKey = useBrowserUseStore((state) => state.apiKey);
  const albertSupermemoryKey = useAlbertSupermemoryStore((state) => state.apiKey);
  const lawMode = useLawLlmStore((state) => state.mode);
  const lawModelByMode = useLawLlmStore((state) => state.modelByMode);
  const googleApiKey = useLawLlmByokStore((state) => state.googleApiKey);
  const openaiApiKey = useLawLlmByokStore((state) => state.openaiApiKey);
  const anthropicApiKey = useLawLlmByokStore((state) => state.anthropicApiKey);
  const vertexProjectId = useLawLlmByokStore((state) => state.vertexProjectId);
  const activeLawLlmApiKey = lawMode === "openai"
    ? openaiApiKey
    : lawMode === "anthropic"
      ? anthropicApiKey
      : lawMode === "server-1" || isVertexLawLlmMode(lawMode)
        ? googleApiKey
        : "";
  const activeVertexProjectId = isVertexLawLlmMode(lawMode)
    ? vertexProjectId
    : "";
  const activeLawLlmModel = lawModelByMode[lawMode];
  const lawModeConfigured = isLawLlmModeConfigured(lawMode, activeLawLlmApiKey);
  const geoCoords = useGeolocation();

  const setComposerActions = useComposerActionsStore((state) => state.setActions);
  useEffect(() => {
    setComposerActions({
      lawMode,
      lawModeConfigured,
      researchConfigured: Boolean(browserUseEnabled && browserUseKey.trim()),
      supermemoryConfigured: Boolean(albertSupermemoryKey.trim()),
      onLawModeChange: onLawModeChange ?? null,
      onOpenLawLlmSettings: onOpenLawLlmSettings,
      onOpenResearchSettings: onOpenResearchSettings ?? null,
      onOpenSupermemorySettings: onOpenSupermemorySettings ?? null,
    });
  }, [
    albertSupermemoryKey,
    browserUseEnabled,
    browserUseKey,
    lawMode,
    lawModeConfigured,
    onLawModeChange,
    onOpenLawLlmSettings,
    onOpenResearchSettings,
    onOpenSupermemorySettings,
    setComposerActions,
  ]);

  const transport = useMemo(
    () =>
      new LawAgentChatTransport({
        api: "/api/chat",
        headers: {
          ...buildLawLlmHeaders(lawMode, {
            apiKey: activeLawLlmApiKey,
            model: activeLawLlmModel,
            userLat: geoCoords?.lat,
            userLng: geoCoords?.lng,
            vertexProjectId: activeVertexProjectId,
          }),
          ...buildWebResearchHeaders({
            authenticated: sessionAuthenticated,
            enabled: browserUseEnabled,
            apiKey: browserUseKey,
          }),
        },
        onConfigurationRequired: onOpenLawLlmSettings,
        requiresConfiguration: !lawModeConfigured,
      }),
    [
      activeLawLlmApiKey,
      activeLawLlmModel,
      activeVertexProjectId,
      browserUseEnabled,
      browserUseKey,
      geoCoords,
      lawMode,
      lawModeConfigured,
      onOpenLawLlmSettings,
      sessionAuthenticated,
    ],
  );

  const chat = useChat({
    id: currentThreadId,
    messages: initialMessages,
    transport,
  });
  const runtime = useAISDKRuntime(chat);
  transport.setRuntime(runtime);

  // Persist messages to localStorage using AI SDK's UIMessage[] (not assistant-ui ThreadMessage[])
  const persistRef = useRef(onPersistThread);
  persistRef.current = onPersistThread;
  useEffect(() => {
    if (chat.status === 'streaming' || chat.status === 'submitted' || chat.messages.length === 0) {
      return;
    }
    const timer = globalThis.setTimeout(() => {
      void persistRef.current(currentThreadId, chat.messages);
    }, 350);
    return () => { globalThis.clearTimeout(timer); };
  }, [chat.status, chat.messages, currentThreadId]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <main className="flex h-dvh min-w-0 flex-1 overflow-hidden bg-background">
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatHeader
            onNewChat={onNewChat}
            onSignOut={onSignOut}
            onToggleHistory={onToggleHistory}
            signingOut={signingOut}
          />
          <div className="relative flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <ThreadWithSuggestions />
            </div>
            <Canvas />
          </div>
        </div>

      </main>
    </AssistantRuntimeProvider>
  );
}

export function AlbertChatApp({
  navigateToThread,
  routeThreadId,
}: {
  navigateToThread: NavigateToThread;
  routeThreadId: string;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => getStoredAlbertSidebarCollapsed());
  const [researchSettingsOpen, setResearchSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [llmSettingsOpen, setLlmSettingsOpen] = useState(false);
  const {
    createNewThread,
    currentThreadId,
    initialMessages,
    loadingThread,
    persistThread,
    removeThread,
    runtimeSeed,
    selectThread,
    threads,
  } = useAlbertHistory(routeThreadId);
  const lawMode = useLawLlmStore((state) => state.mode);
  const setLawMode = useLawLlmStore((state) => state.setMode);

  const handleLawModeChange = (nextMode: LawLlmMode) => {
    setLawMode(nextMode);

    if (isByokLawLlmMode(nextMode) && !getLawLlmByokApiKey(nextMode)) {
      setLlmSettingsOpen(true);
    }
  };

  const handleToggleSidebar = () => {
    if (isDesktopViewport()) {
      setSidebarCollapsed((current) => {
        const next = !current;
        setStoredAlbertSidebarCollapsed(next);
        return next;
      });
      return;
    }

    setSidebarOpen((current) => !current);
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AlbertSidebar
        collapsed={sidebarCollapsed}
        currentThreadId={currentThreadId}
        loading={loadingThread}
        onDeleteThread={(threadId) => {
          void removeThread(threadId).then((nextThreadId) => {
            if (threadId === currentThreadId && nextThreadId) {
              navigateToThread(nextThreadId, { replace: true });
            }
          });
        }}
        onNewChat={() => {
          const nextThreadId = createNewThread();
          navigateToThread(nextThreadId);
          setSidebarOpen(false);
        }}
        onSelectThread={(threadId) => {
          void selectThread(threadId);
          navigateToThread(threadId);
          setSidebarOpen(false);
        }}
        onToggleSidebar={handleToggleSidebar}
        open={sidebarOpen}
        threads={threads}
      />

      <div className="flex min-w-0 flex-1">
        {sidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/35 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          />
        )}

        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          {loadingThread ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading saved conversation...
            </div>
          ) : (
            <AlbertRuntimeShell
              key={`${currentThreadId}:${runtimeSeed}`}
              currentThreadId={currentThreadId}
              initialMessages={initialMessages}
              onNewChat={() => {
                const nextThreadId = createNewThread();
                navigateToThread(nextThreadId);
              }}
              onLawModeChange={handleLawModeChange}
              onOpenLawLlmSettings={() => setLlmSettingsOpen(true)}
              onOpenResearchSettings={() => setResearchSettingsOpen(true)}
              onSignOut={undefined}
              onOpenSupermemorySettings={() => setSettingsOpen(true)}
              onPersistThread={persistThread}
              sessionAuthenticated={false}
              signingOut={false}
              onToggleHistory={handleToggleSidebar}
            />
          )}
        </div>
      </div>

      <AlbertSupermemorySettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <LawLlmSettings
        authenticated={false}
        currentMode={lawMode}
        open={llmSettingsOpen}
        onClose={() => setLlmSettingsOpen(false)}
      />
      <BrowserUseSettings
        authenticated={false}
        open={researchSettingsOpen}
        onClose={() => setResearchSettingsOpen(false)}
      />
    </div>
  );
}

export function createFreshThreadId() {
  return createNewThreadId();
}