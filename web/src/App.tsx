import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { Shell, Wordmark } from "./components/Shell";
import { EmptyState, LinkButton, Toasts } from "./components/ui";
import { AppProvider, useApp, useChainData } from "./lib/app";
import { loadConfig, type AppConfig } from "./lib/config";
import { ease } from "./lib/motion";
import { href, useRoute, type RouteMatch } from "./lib/router";
import { CampaignPage } from "./pages/Campaign";
import { CouncilPage } from "./pages/Council";
import { CreatorPage } from "./pages/Creator";
import { Home } from "./pages/Home";
import { ReviewPage } from "./pages/Review";

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig()
      .then(setConfig)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <SetupScreen missingDemo={error === "local-demo-missing"} detail={error} />;
  if (!config) return null;
  return (
    // Visitors who ask for less motion get fades instead of movement, everywhere.
    <MotionConfig reducedMotion="user">
      <AppProvider config={config}>
        <Routes />
        <Toasts />
      </AppProvider>
    </MotionConfig>
  );
}

const TITLES: Record<RouteMatch["page"], string> = {
  home: "Herald · Pay the people who carry your message",
  campaign: "Campaign · Herald",
  review: "Review queue · Herald",
  council: "Council · Herald",
  creator: "Creator · Herald",
  notfound: "Not found · Herald",
};

function Routes() {
  const route = useRoute();
  const { displayName } = useApp();

  useEffect(() => {
    document.title = route.page === "creator" ? `${displayName(route.accountId)} · Herald` : TITLES[route.page];
  }, [route, displayName]);

  let page: ReactNode;
  switch (route.page) {
    case "home":
      page = <Home />;
      break;
    case "campaign":
      page = <CampaignPage id={route.id} />;
      break;
    case "review":
      page = <ReviewPage />;
      break;
    case "council":
      page = <CouncilPage />;
      break;
    case "creator":
      page = <CreatorPage accountId={route.accountId} />;
      break;
    default:
      page = <EmptyState title="That page doesn't exist" body="The link may be old or mistyped." action={<LinkButton href={href.home} size="sm">Go to campaigns</LinkButton>} />;
  }

  return (
    <Shell route={route}>
      <ChainCheck />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={window.location.hash || "#/"}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.24, ease } }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.12, ease } }}
        >
          {page}
        </motion.div>
      </AnimatePresence>
    </Shell>
  );
}

/** Says so plainly when the chain stops answering, instead of leaving screens empty. */
function ChainCheck() {
  const { rpc, config } = useApp();
  const head = useChainData(() => rpc.chainTimeMs(), []);
  if (!head.error) return null;
  return (
    <div role="alert" className="mb-8 rounded-md border border-veto/40 bg-veto-wash px-4 py-3 text-sm text-veto-ink">
      Can't reach the chain at <span className="font-data">{config.rpcUrl}</span>.{" "}
      {config.network === "local" ? "Start it again with cargo run --example demo, then reload this page." : "Check your connection and reload."}
    </div>
  );
}

function SetupScreen({ missingDemo, detail }: { missingDemo: boolean; detail: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] flex-col justify-center gap-6 px-4 py-12">
      <Wordmark />
      <h1 className="font-display text-[40px] leading-tight">{missingDemo ? "Start the demo chain first" : "Herald couldn't start"}</h1>
      {missingDemo ? (
        <>
          <p className="text-[16px] text-ink-soft">The local demo runs Herald and a real Sputnik DAO on a private NEAR chain on your machine. Start it in a terminal, then reload this page.</p>
          <pre className="overflow-x-auto rounded-md border border-line bg-surface px-4 py-3 font-data text-[13.5px] text-ink">
            {"cd contract\ncargo run --example demo"}
          </pre>
          <p className="text-sm text-ink-faint">It deploys both contracts, seeds a fictional DAO with campaigns and creators, and writes web/public/local-demo.json for this app. Leave it running.</p>
        </>
      ) : (
        <p className="font-data text-sm text-veto-ink">{detail}</p>
      )}
    </div>
  );
}
