import { JoinResponse, type StudentAssignment, matchesAllowlist } from "@asterisk/shared";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { ApiCallError, api } from "./api";
import { AssignmentList, NotEnabled } from "./AssignmentList";
import { AssignmentView } from "./AssignmentView";
import { JoinScreen } from "./JoinScreen";
import { isExtension, load, remove, save, useActiveTabUrl } from "./platform";

const SESSION_KEY = "asterisk.session";
const ASSIGNMENT_KEY = "asterisk.assignmentId";

type Loaded<T> = { state: "loading" } | { state: "ready"; value: T };

export function App() {
  const [session, setSession] = useState<Loaded<JoinResponse | null>>({ state: "loading" });
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<StudentAssignment[] | null>(null);
  const [notice, setNotice] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [tabUrl, simulateTabUrl] = useActiveTabUrl();

  useEffect(() => {
    void Promise.all([load(SESSION_KEY, JoinResponse), load(ASSIGNMENT_KEY, z.string())]).then(([s, a]) => {
      setSession({ state: "ready", value: s });
      setAssignmentId(a);
    });
  }, []);

  const signOut = useCallback((message?: string) => {
    void remove(SESSION_KEY);
    void remove(ASSIGNMENT_KEY);
    setSession({ state: "ready", value: null });
    setAssignments(null);
    setAssignmentId(null);
    setNotice(message);
  }, []);
  const onUnauthorized = useCallback(() => signOut("Please join your class again."), [signOut]);

  const token = session.state === "ready" ? session.value?.token : undefined;
  useEffect(() => {
    if (!token) return;
    setLoadError(undefined);
    api
      .assignments(token)
      .then((res) => setAssignments(res.assignments))
      .catch((err: unknown) => {
        if (err instanceof ApiCallError && err.status === 401) onUnauthorized();
        else setLoadError(err instanceof ApiCallError ? err.message : "Couldn't load assignments.");
      });
  }, [token, onUnauthorized]);

  const selectAssignment = (id: string | null) => {
    setAssignmentId(id);
    void (id ? save(ASSIGNMENT_KEY, id) : remove(ASSIGNMENT_KEY));
  };

  if (session.state === "loading") return null;
  if (!session.value) {
    return (
      <Shell tabUrl={tabUrl} onSimulate={simulateTabUrl}>
        <JoinScreen
          notice={notice}
          onJoined={(s) => {
            void save(SESSION_KEY, s);
            setNotice(undefined);
            setSession({ state: "ready", value: s });
          }}
        />
      </Shell>
    );
  }

  const assignment = assignments?.find((a) => a.id === assignmentId) ?? null;
  // S2: the panel only helps on pages the teacher allowed for this assignment.
  const allowedHere = assignment ? matchesAllowlist(tabUrl ?? "", assignment.allowlist) : false;

  return (
    <Shell tabUrl={tabUrl} onSimulate={simulateTabUrl}>
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            Asterisk<span className="text-accent">*</span>{" "}
            <span className="font-normal text-zinc-500">· {session.value.class.name}</span>
          </p>
          <p className="truncate text-xs text-zinc-500">Signed in as {session.value.student.displayName}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          {assignment && (
            <button type="button" className="btn-ghost" onClick={() => selectAssignment(null)}>
              Assignments
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={() => signOut()}>
            Leave class
          </button>
        </div>
      </header>

      {loadError ? (
        <p role="alert" className="m-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">
          {loadError}
        </p>
      ) : assignments === null ? (
        <p className="p-4 text-zinc-500">Loading…</p>
      ) : !assignment ? (
        <AssignmentList assignments={assignments} onSelect={selectAssignment} />
      ) : (
        <>
          {!allowedHere && <NotEnabled url={tabUrl} allowlist={assignment.allowlist} />}
          {/* Hidden, not unmounted, off the allowlist: coming back keeps the student's chat and typed answers. */}
          <div className={allowedHere ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <AssignmentView
              key={assignment.id}
              token={session.value.token}
              assignment={assignment}
              onUnauthorized={onUnauthorized}
            />
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({
  tabUrl,
  onSimulate,
  children,
}: {
  tabUrl: string | null;
  onSimulate: (url: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      {!isExtension && (
        <label className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <span className="shrink-0 font-semibold">Dev preview · tab URL</span>
          <input
            className="min-w-0 flex-1 rounded border border-amber-300 bg-white px-1.5 py-0.5 font-mono"
            value={tabUrl ?? ""}
            onChange={(e) => onSimulate(e.target.value)}
          />
        </label>
      )}
      {children}
    </div>
  );
}
