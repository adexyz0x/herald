import { useState } from "react";
import { useApp, useChainNow } from "../lib/app";
import { formatNear } from "../lib/format";
import type { Campaign, Submission } from "../lib/herald";
import { href } from "../lib/router";
import { AccountLink, Avatar, Near, RankBadge, RouteTag, Seal, StatusChip, When } from "./chain";
import { ActionButton, Button, ExternalLink, Field, Modal, inputClass } from "./ui";

/** Reasons reviewers reach for most. Free text is always available too. */
const VETO_REASONS = [
  "Post was deleted after payout was scheduled",
  "Bought or fake engagement",
  "Recycled or copied content",
  "Off-brief: doesn't follow the campaign brief",
  "Proof link doesn't show the work",
];
const REJECT_REASONS = [
  "Off-brief: doesn't follow the campaign brief",
  "Proof link doesn't show the work",
  "Quality isn't there yet: please revise and resubmit",
  "Duplicate of an earlier submission",
];

export interface RowContext {
  council: string[];
  /** Proposal bond for the DAO, in yoctoNEAR. */
  bond: string;
  /** Submission ids that already have an open DAO vote. */
  openVotes: Set<number>;
}

export function SubmissionRow({
  sub,
  campaign,
  ctx,
  showCampaign = false,
}: {
  sub: Submission;
  campaign: Campaign;
  ctx: RowContext;
  showCampaign?: boolean;
}) {
  const { actor, herald, dao, execute, displayName } = useApp();
  const now = useChainNow();
  const [modal, setModal] = useState<"veto" | "reject" | null>(null);

  const me = actor.accountId;
  const isReviewer = Boolean(me && campaign.reviewers.includes(me) && me !== sub.creator);
  const isCouncil = Boolean(me && ctx.council.includes(me));
  const windowOpen = sub.status === "Challenge" && sub.challenge_ends_at_ms != null && now < sub.challenge_ends_at_ms;
  const windowDone = sub.status === "Challenge" && !windowOpen;

  const actions: React.ReactNode[] = [];
  if (sub.status === "Pending" && isReviewer) {
    actions.push(
      <ActionButton key="approve" variant="primary" size="sm" run={() => execute(herald.approve(sub.id), { success: `Approved. ${displayName(sub.creator)} was paid ${formatNear(sub.amount)} NEAR.` })}>
        Approve and pay
      </ActionButton>,
      <Button key="reject" size="sm" onClick={() => setModal("reject")}>
        Reject
      </Button>,
      <ActionButton key="escalate" variant="ghost" size="sm" run={() => execute(herald.escalate(sub.id), { success: "Sent to the DAO for a vote." })}>
        Send to DAO
      </ActionButton>,
    );
  }
  if (windowOpen && isReviewer) {
    actions.push(
      <Button key="veto" variant="danger" size="sm" onClick={() => setModal("veto")}>
        Veto
      </Button>,
    );
  }
  if (windowDone && actor.kind !== "guest") {
    actions.push(
      <ActionButton key="finalize" variant="primary" size="sm" run={() => execute(herald.finalize(sub.id), { success: "Window closed. Payout sent." })}>
        Pay now
      </ActionButton>,
    );
  }
  if (sub.status === "Approved" && actor.kind !== "guest") {
    actions.push(
      <ActionButton key="claim" size="sm" run={() => execute(herald.claim(sub.id), { success: "Payout sent." })}>
        Retry payout
      </ActionButton>,
    );
  }
  if (sub.status === "AwaitingDao") {
    if (ctx.openVotes.has(sub.id)) {
      actions.push(
        <a key="vote" href={href.council} className="text-[13px] font-medium text-accent hover:underline">
          View the vote
        </a>,
      );
    } else if (isCouncil) {
      actions.push(
        <ActionButton
          key="open-vote"
          size="sm"
          run={async () => {
            const proposal = await herald.daoProposal(sub.id);
            if (proposal) await execute(dao.addProposal(proposal, ctx.bond), { success: "DAO vote opened. The council can vote now." });
          }}
        >
          Open DAO vote
        </ActionButton>,
      );
    }
  }

  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 border-b border-line py-4 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_190px_210px] sm:items-center">
      <Avatar accountId={sub.creator} size={36} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <AccountLink accountId={sub.creator} />
          <RankBadge tier={sub.tier_at_submit} size="sm" />
        </div>
        <p className="mt-0.5 truncate text-sm text-ink-soft">
          <span className="font-medium text-ink">{sub.deliverable}</span>
          {sub.note && <span> · {sub.note}</span>}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <ExternalLink href={sub.proof_url} className="text-[12.5px]">
            Proof
          </ExternalLink>
          {showCampaign && (
            <a href={href.campaign(campaign.id)} className="text-[12.5px] text-ink-faint hover:text-ink">
              {campaign.title}
            </a>
          )}
          <When ms={sub.created_at_ms} />
        </div>
      </div>
      <div className="col-start-2 flex flex-col gap-1.5 sm:col-start-auto">
        <Near value={sub.amount} className="text-[15px] font-medium text-ink" />
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={sub.status} endsAtMs={sub.challenge_ends_at_ms} />
          {sub.status === "Paid" && <RouteTag route={sub.route} />}
        </div>
        {sub.reason && (sub.status === "Rejected" || sub.status === "Vetoed") && (
          <p className="text-[12.5px] text-ink-soft">
            “{sub.reason}”{sub.decided_by && <span className="text-ink-faint"> · {displayName(sub.decided_by)}</span>}
          </p>
        )}
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto sm:justify-end">
        {sub.status === "Paid" ? <Seal route={sub.route} size={52} /> : actions}
      </div>

      <ReasonModal
        open={modal === "veto"}
        title="Veto this payout"
        reasons={VETO_REASONS}
        withFraud
        confirmLabel="Veto payout"
        explain={`${displayName(sub.creator)} loses ${campaign.rules.slash_points} reputation points with this DAO and the funds go back to the campaign. Everyone can see your reason.`}
        onClose={() => setModal(null)}
        onConfirm={(reason, fraud) => execute(herald.veto(sub.id, reason, fraud), { success: fraud ? "Payout vetoed and the creator is banned." : "Payout vetoed." })}
      />
      <ReasonModal
        open={modal === "reject"}
        title="Reject this submission"
        reasons={REJECT_REASONS}
        confirmLabel="Reject"
        explain="No reputation is lost. The creator sees your reason and can resubmit."
        onClose={() => setModal(null)}
        onConfirm={(reason) => execute(herald.reject(sub.id, reason), { success: "Submission rejected." })}
      />
    </li>
  );
}

function ReasonModal({
  open,
  title,
  reasons,
  withFraud = false,
  confirmLabel,
  explain,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  reasons: string[];
  withFraud?: boolean;
  confirmLabel: string;
  explain: string;
  onClose: () => void;
  onConfirm: (reason: string, fraud: boolean) => Promise<unknown>;
}) {
  const [choice, setChoice] = useState(reasons[0]);
  const [custom, setCustom] = useState("");
  const [fraud, setFraud] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reason = choice === "other" ? custom.trim() : choice;

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!reason) {
            setError("Write a reason, so the creator and the DAO can see why.");
            return;
          }
          if (reason.length > 280) {
            setError("Keep the reason under 280 characters.");
            return;
          }
          setBusy(true);
          try {
            await onConfirm(reason, fraud);
          } finally {
            setBusy(false);
          }
          onClose();
        }}
      >
        <p className="text-sm text-ink-soft">{explain}</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-medium text-ink">Reason</legend>
          {[...reasons, "other"].map((r) => (
            <label key={r} className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-wash">
              <input type="radio" name="reason" className="mt-0.5 accent-[var(--accent)]" checked={choice === r} onChange={() => (setChoice(r), setError(null))} />
              {r === "other" ? "Something else" : r}
            </label>
          ))}
        </fieldset>
        {choice === "other" && (
          <Field label="Your reason" error={error}>
            {({ id, describedBy, invalid }) => (
              <input id={id} aria-describedby={describedBy} aria-invalid={invalid} className={inputClass} value={custom} maxLength={280} onChange={(e) => (setCustom(e.target.value), setError(null))} placeholder="The video was reuploaded from another creator" />
            )}
          </Field>
        )}
        {withFraud && (
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
            <input type="checkbox" className="mt-0.5 accent-[var(--veto)]" checked={fraud} onChange={(e) => setFraud(e.target.checked)} />
            <span>
              Mark as fraud
              <span className="block text-[12.5px] text-ink-faint">Also bans this creator from every campaign of this DAO. Only a DAO vote can lift it.</span>
            </span>
          </label>
        )}
        {error && choice !== "other" && <p className="text-[12.5px] text-veto-ink">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={withFraud ? "danger" : "primary"} busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
