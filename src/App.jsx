import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://gtwqaxbkabktdyiebcvx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VkwqdAhEdn_lzYq3wUBARg_M0ckx7Pd";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATUS_CONFIG = {
  "Pending":     { color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  "In Progress": { color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  "Done":        { color: "#10b981", bg: "rgba(16,185,129,0.12)" },
};

const emptyEvent = (batchId, index) => ({
  id: Date.now().toString() + Math.random(),
  batch_id: batchId,
  sl_no: index + 1,
  event_name: "",
  assigned_to: "Execom",
  deadline: "",
  reassigned: "",
  folders_count: 0,
  moms_count: 0,
  status: "Pending",
  notes: "",
  _dirty: true,
});

export default function App() {
  const [batches, setBatches]             = useState([]);
  const [activeBatchId, setActiveBatchId] = useState(null);
  const [members, setMembers]             = useState({}); // { batchId: [...] }
  const [events, setEvents]               = useState({}); // { batchId: [...] }
  const [view, setView]                   = useState("home");
  const [loading, setLoading]             = useState(true);
  const [committing, setCommitting]       = useState(false);
  const [commitStatus, setCommitStatus]   = useState(null); // null | "ok" | "err"
  const [newBatchName, setNewBatchName]   = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [editingCell, setEditingCell]     = useState(null);
  const [editValue, setEditValue]         = useState("");
  const [showMemberPanel, setShowMemberPanel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const inputRef = useRef();

  // ── Load everything on mount ──
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [bRes, mRes, eRes] = await Promise.all([
        supabase.from("batches").select("*").order("created_at", { ascending: true }),
        supabase.from("seed_members").select("*"),
        supabase.from("events").select("*").order("sl_no", { ascending: true }),
      ]);

      const batchList = bRes.data || [];
      setBatches(batchList);

      const memberMap = {};
      const eventMap  = {};
      for (const b of batchList) {
        memberMap[b.id] = (mRes.data || []).filter(m => m.batch_id === b.id);
        eventMap[b.id]  = (eRes.data || []).filter(e => e.batch_id === b.id);
      }
      setMembers(memberMap);
      setEvents(eventMap);

      if (batchList.length > 0) {
        setActiveBatchId(batchList[0].id);
        setView("batch");
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus();
  }, [editingCell]);

  const activeBatch   = batches.find(b => b.id === activeBatchId);
  const activeMembers = activeBatchId ? (members[activeBatchId] || []) : [];
  const activeEvents  = activeBatchId ? (events[activeBatchId] || []) : [];
  const dirtyEvents   = activeEvents.filter(e => e._dirty);
  const hasDirty      = dirtyEvents.length > 0;

  // ── Helpers ──
  function setActiveBatchEvents(updater) {
    setEvents(prev => ({ ...prev, [activeBatchId]: updater(prev[activeBatchId] || []) }));
  }
  function setActiveBatchMembers(updater) {
    setMembers(prev => ({ ...prev, [activeBatchId]: updater(prev[activeBatchId] || []) }));
  }

  // ── Batch ops ──
  async function createBatch() {
    if (!newBatchName.trim()) return;
    const batch = { id: Date.now().toString(), name: newBatchName.trim(), created_at: new Date().toISOString() };
    const { error } = await supabase.from("batches").insert(batch);
    if (!error) {
      setBatches(prev => [...prev, batch]);
      setMembers(prev => ({ ...prev, [batch.id]: [] }));
      setEvents(prev => ({ ...prev, [batch.id]: [] }));
      setActiveBatchId(batch.id);
      setNewBatchName("");
      setView("batch");
    }
  }

  async function deleteBatch(id) {
    await Promise.all([
      supabase.from("events").delete().eq("batch_id", id),
      supabase.from("seed_members").delete().eq("batch_id", id),
      supabase.from("batches").delete().eq("id", id),
    ]);
    setBatches(prev => {
      const next = prev.filter(b => b.id !== id);
      const newActive = next[0]?.id || null;
      setActiveBatchId(newActive);
      setView(newActive ? "batch" : "home");
      return next;
    });
    setConfirmDelete(null);
  }

  // ── Member ops ──
  async function addMember() {
    if (!newMemberName.trim() || !activeBatchId) return;
    const m = { id: Date.now().toString(), batch_id: activeBatchId, name: newMemberName.trim() };
    const { error } = await supabase.from("seed_members").insert(m);
    if (!error) {
      setActiveBatchMembers(prev => [...prev, m]);
      setNewMemberName("");
    }
  }

  async function removeMember(memberId) {
    const memberName = activeMembers.find(m => m.id === memberId)?.name;
    await supabase.from("seed_members").delete().eq("id", memberId);
    setActiveBatchMembers(prev => prev.filter(m => m.id !== memberId));
    // reassign their events to Execom locally (mark dirty)
    setActiveBatchEvents(prev => prev.map(e =>
      e.assigned_to === memberName ? { ...e, assigned_to: "Execom", _dirty: true } : e
    ));
  }

  // ── Event ops ──
  function addEvent() {
    if (!activeBatchId) return;
    const ev = emptyEvent(activeBatchId, activeEvents.length);
    setActiveBatchEvents(prev => [...prev, ev]);
  }

  async function removeEvent(eventId) {
    const ev = activeEvents.find(e => e.id === eventId);
    if (!ev._dirty) await supabase.from("events").delete().eq("id", eventId); // only delete from DB if it was committed
    setActiveBatchEvents(prev =>
      prev.filter(e => e.id !== eventId).map((e, i) => ({ ...e, sl_no: i + 1, _dirty: e._dirty || true }))
    );
  }

  function updateEventField(eventId, field, value) {
    setActiveBatchEvents(prev =>
      prev.map(e => e.id === eventId ? { ...e, [field]: value, _dirty: true } : e)
    );
  }

  function startEdit(eventId, field, currentValue) {
    setEditingCell({ eventId, field });
    setEditValue(String(currentValue ?? ""));
  }

  function commitEdit() {
    if (!editingCell) return;
    updateEventField(editingCell.eventId, editingCell.field, editValue);
    setEditingCell(null);
  }

  // ── COMMIT to Supabase ──
  async function commitChanges() {
    if (!hasDirty) return;
    setCommitting(true);
    setCommitStatus(null);

    const toUpsert = dirtyEvents.map(({ _dirty, ...e }) => e);
    const { error } = await supabase.from("events").upsert(toUpsert);

    if (!error) {
      setActiveBatchEvents(prev => prev.map(e => ({ ...e, _dirty: false })));
      setCommitStatus("ok");
      setTimeout(() => setCommitStatus(null), 3000);
    } else {
      setCommitStatus("err");
    }
    setCommitting(false);
  }

  // ── Stats ──
  function batchStats() {
    return {
      total: activeEvents.length,
      done: activeEvents.filter(e => e.status === "Done").length,
      inProgress: activeEvents.filter(e => e.status === "In Progress").length,
      totalFolders: activeEvents.reduce((s, e) => s + Number(e.folders_count || 0), 0),
      totalMoms: activeEvents.reduce((s, e) => s + Number(e.moms_count || 0), 0),
    };
  }

  function memberStats() {
    const stats = {};
    for (const m of activeMembers) {
      const a = activeEvents.filter(e => e.assigned_to === m.name);
      stats[m.name] = {
        events: a.length,
        folders: a.reduce((s, e) => s + Number(e.folders_count || 0), 0),
        moms: a.reduce((s, e) => s + Number(e.moms_count || 0), 0),
        done: a.filter(e => e.status === "Done").length,
      };
    }
    return stats;
  }

  const assigneeOptions = ["Execom", ...activeMembers.map(m => m.name)];

  return (
    <div style={S.root}>
      <style>{css}</style>

      {/* SIDEBAR */}
      <aside style={S.sidebar}>
        <div style={S.sidebarLogo}>
          <span style={S.logoIcon}>⟁</span>
          <span style={S.logoText}>SEED<br /><span style={S.logoSub}>Doc Tracker</span></span>
        </div>
        <div style={S.sidebarSection}>BATCHES</div>
        {batches.map(b => (
          <div key={b.id}
            style={{ ...S.batchItem, ...(activeBatchId === b.id && view === "batch" ? S.batchItemActive : {}) }}
            onClick={() => { setActiveBatchId(b.id); setView("batch"); setShowMemberPanel(false); }}>
            <span style={S.batchDot} />
            <span style={S.batchItemName}>{b.name}</span>
            <span style={S.batchDeleteBtn} onClick={e => { e.stopPropagation(); setConfirmDelete(b.id); }}>×</span>
          </div>
        ))}
        <button style={S.newBatchBtn} onClick={() => setView("newBatch")}>+ New Batch</button>
        <div style={S.sidebarFooter}>Documentation Team<br /><span style={{ opacity: 0.4, fontSize: "10px" }}>SEED Club</span></div>
      </aside>

      {/* MAIN */}
      <main style={S.main}>

        {loading && (
          <div style={S.centerPage}>
            <div style={{ ...S.heroIcon, animation: "spin 1.5s linear infinite" }}>⟁</div>
            <p style={S.heroSub}>Loading from Supabase…</p>
          </div>
        )}

        {!loading && view === "home" && (
          <div style={S.centerPage}>
            <div style={S.heroIcon}>⟁</div>
            <h1 style={S.heroTitle}>SEED Documentation Tracker</h1>
            <p style={S.heroSub}>Each execom batch gets its own space. Create your batch to get started.</p>
            <button style={S.heroCta} onClick={() => setView("newBatch")}>Create Your Batch →</button>
          </div>
        )}

        {!loading && view === "newBatch" && (
          <div style={S.centerPage}>
            <h2 style={S.pageTitle}>New Execom Batch</h2>
            <p style={S.pageSub}>Give this batch a name, e.g. <em>Execom 2024–25</em></p>
            <div style={S.inputRow}>
              <input style={S.bigInput} placeholder="Batch name…" value={newBatchName}
                onChange={e => setNewBatchName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createBatch()} autoFocus />
              <button style={S.heroCta} onClick={createBatch}>Create →</button>
            </div>
          </div>
        )}

        {!loading && view === "batch" && activeBatch && (() => {
          const stats  = batchStats();
          const mStats = memberStats();
          return (
            <div style={S.batchView}>

              {/* Header */}
              <div style={S.batchHeader}>
                <div>
                  <h1 style={S.batchTitle}>{activeBatch.name}</h1>
                  <span style={S.batchDate}>
                    Created {new Date(activeBatch.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button style={S.membersBtn} onClick={() => setShowMemberPanel(p => !p)}>
                    👥 Seed Members ({activeMembers.length})
                  </button>

                  {/* COMMIT BUTTON */}
                  <button
                    style={{
                      ...S.commitBtn,
                      ...(hasDirty ? S.commitBtnActive : S.commitBtnDisabled),
                    }}
                    onClick={commitChanges}
                    disabled={!hasDirty || committing}
                  >
                    {committing ? "Saving…" :
                     commitStatus === "ok" ? "✓ Saved!" :
                     commitStatus === "err" ? "✗ Error" :
                     hasDirty ? `⬆ Commit (${dirtyEvents.length} change${dirtyEvents.length > 1 ? "s" : ""})` :
                     "✓ All saved"}
                  </button>
                </div>
              </div>

              {/* Dirty banner */}
              {hasDirty && (
                <div style={S.dirtyBanner}>
                  ⚠ You have {dirtyEvents.length} unsaved change{dirtyEvents.length > 1 ? "s" : ""}. Hit <strong>Commit</strong> to save to Supabase.
                </div>
              )}

              {/* Stats */}
              <div style={S.statsBar}>
                <StatCard label="Total Events"  value={stats.total}        accent="#e2c27d" />
                <StatCard label="Done"           value={stats.done}         accent="#10b981" />
                <StatCard label="In Progress"    value={stats.inProgress}   accent="#3b82f6" />
                <StatCard label="Total Folders"  value={stats.totalFolders} accent="#a78bfa" />
                <StatCard label="Total MOMs"     value={stats.totalMoms}    accent="#f472b6" />
              </div>

              {/* Member panel */}
              {showMemberPanel && (
                <div style={S.memberPanel}>
                  <div style={S.memberPanelHeader}>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "15px", color: "#e2c27d" }}>Seed Members</span>
                    <button style={S.closeBtn} onClick={() => setShowMemberPanel(false)}>×</button>
                  </div>
                  <div style={S.memberList}>
                    {activeMembers.length === 0 && <span style={{ color: "#555", fontSize: "12px" }}>No members yet.</span>}
                    {activeMembers.map(m => (
                      <div key={m.id} style={S.memberChip}>
                        <span style={S.memberAvatar}>{m.name[0].toUpperCase()}</span>
                        <span style={S.memberChipName}>{m.name}</span>
                        {mStats[m.name] && (
                          <span style={S.memberMiniStats}>
                            {mStats[m.name].events}ev · {mStats[m.name].folders}f · {mStats[m.name].moms}m
                          </span>
                        )}
                        <button style={S.removeMember} onClick={() => removeMember(m.id)}>×</button>
                      </div>
                    ))}
                  </div>
                  <div style={S.addMemberRow}>
                    <input style={S.memberInput} placeholder="Add member name…" value={newMemberName}
                      onChange={e => setNewMemberName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addMember()} />
                    <button style={S.addMemberBtn} onClick={addMember}>Add</button>
                  </div>
                </div>
              )}

              {/* Table */}
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {["#", "Event Name", "Assigned To", "Deadline", "Reassigned", "Folders", "MOMs", "Status", "Notes", ""].map((h, i) => (
                        <th key={i} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeEvents.map(ev => (
                      <tr key={ev.id} style={{ ...S.tr, ...(ev._dirty ? S.trDirty : {}) }} className="table-row">

                        <td style={S.td}>
                          <span style={S.slNo}>{ev.sl_no}</span>
                          {ev._dirty && <span style={S.dirtyDot} title="Unsaved" />}
                        </td>

                        <td style={S.td} onClick={() => startEdit(ev.id, "event_name", ev.event_name)}>
                          {editingCell?.eventId === ev.id && editingCell?.field === "event_name"
                            ? <input ref={inputRef} style={S.cellInput} value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()} />
                            : <span style={S.cellText}>{ev.event_name || <span style={S.placeholder}>Click to edit</span>}</span>}
                        </td>

                        <td style={S.td}>
                          <select style={S.selectCell} value={ev.assigned_to}
                            onChange={e => updateEventField(ev.id, "assigned_to", e.target.value)}>
                            {assigneeOptions.map(o => <option key={o}>{o}</option>)}
                          </select>
                        </td>

                        <td style={S.td} onClick={() => startEdit(ev.id, "deadline", ev.deadline)}>
                          {editingCell?.eventId === ev.id && editingCell?.field === "deadline"
                            ? <input ref={inputRef} type="date" style={S.cellInput} value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()} />
                            : <span style={S.cellText}>
                                {ev.deadline
                                  ? new Date(ev.deadline + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                                  : <span style={S.placeholder}>—</span>}
                              </span>}
                        </td>

                        <td style={S.td}>
                          <select style={{ ...S.selectCell, color: ev.reassigned ? "#f472b6" : "#555" }}
                            value={ev.reassigned || ""}
                            onChange={e => updateEventField(ev.id, "reassigned", e.target.value)}>
                            <option value="">—</option>
                            {assigneeOptions.map(o => <option key={o}>{o}</option>)}
                          </select>
                        </td>

                        <td style={S.td} onClick={() => startEdit(ev.id, "folders_count", ev.folders_count)}>
                          {editingCell?.eventId === ev.id && editingCell?.field === "folders_count"
                            ? <input ref={inputRef} type="number" min="0" style={{ ...S.cellInput, width: "52px" }}
                                value={editValue} onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()} />
                            : <span style={{ ...S.cellText, textAlign: "center" }}><span style={S.countBadge}>{ev.folders_count}</span></span>}
                        </td>

                        <td style={S.td} onClick={() => startEdit(ev.id, "moms_count", ev.moms_count)}>
                          {editingCell?.eventId === ev.id && editingCell?.field === "moms_count"
                            ? <input ref={inputRef} type="number" min="0" style={{ ...S.cellInput, width: "52px" }}
                                value={editValue} onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()} />
                            : <span style={{ ...S.cellText, textAlign: "center" }}><span style={S.countBadge}>{ev.moms_count}</span></span>}
                        </td>

                        <td style={S.td}>
                          <select style={{
                            ...S.selectCell,
                            color: STATUS_CONFIG[ev.status].color,
                            background: STATUS_CONFIG[ev.status].bg,
                            borderColor: STATUS_CONFIG[ev.status].color + "44",
                            fontWeight: "600",
                          }}
                            value={ev.status}
                            onChange={e => updateEventField(ev.id, "status", e.target.value)}>
                            {Object.keys(STATUS_CONFIG).map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>

                        <td style={S.td} onClick={() => startEdit(ev.id, "notes", ev.notes)}>
                          {editingCell?.eventId === ev.id && editingCell?.field === "notes"
                            ? <input ref={inputRef} style={{ ...S.cellInput, minWidth: "140px" }} value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()} />
                            : <span style={{ ...S.cellText, color: "#aaa" }}>{ev.notes || <span style={S.placeholder}>—</span>}</span>}
                        </td>

                        <td style={S.td}>
                          <button style={S.rowDelete} onClick={() => removeEvent(ev.id)}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {activeEvents.length === 0 && <div style={S.emptyTable}>No events yet. Add one below ↓</div>}
              </div>

              <button style={S.addEventBtn} onClick={addEvent}>+ Add Event</button>

              {/* Member workload */}
              {activeMembers.length > 0 && (
                <div style={S.memberSummary}>
                  <div style={S.sectionLabel}>MEMBER WORKLOAD</div>
                  <div style={S.memberCards}>
                    {activeMembers.map(m => {
                      const s = mStats[m.name] || {};
                      return (
                        <div key={m.id} style={S.memberCard}>
                          <div style={S.memberCardAvatar}>{m.name[0].toUpperCase()}</div>
                          <div style={S.memberCardName}>{m.name}</div>
                          <div style={S.memberCardStats}>
                            <MiniStat val={s.events  || 0} lbl="Events"  />
                            <MiniStat val={s.folders || 0} lbl="Folders" />
                            <MiniStat val={s.moms    || 0} lbl="MOMs"    />
                            <MiniStat val={s.done    || 0} lbl="Done" color="#10b981" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </main>

      {/* Delete modal */}
      {confirmDelete && (
        <div style={S.modalOverlay} onClick={() => setConfirmDelete(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: "#e2c27d", fontFamily: "'Playfair Display', serif", marginBottom: "8px" }}>Delete Batch?</h3>
            <p style={{ color: "#aaa", fontSize: "13px", marginBottom: "20px" }}>
              This permanently deletes <strong style={{ color: "#fff" }}>{batches.find(b => b.id === confirmDelete)?.name}</strong>, all its events and members.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button style={S.cancelBtn} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button style={S.deleteConfirmBtn} onClick={() => deleteBatch(confirmDelete)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ ...S.statCard, borderColor: accent + "33" }}>
      <span style={{ ...S.statVal, color: accent }}>{value}</span>
      <span style={S.statLbl}>{label}</span>
    </div>
  );
}
function MiniStat({ val, lbl, color = "#e2c27d" }) {
  return (
    <div style={S.memberStat}>
      <span style={{ ...S.memberStatVal, color }}>{val}</span>
      <span style={S.memberStatLbl}>{lbl}</span>
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0d0d; }
  .table-row:hover td { background: rgba(226,194,125,0.03) !important; }
  select option { background: #1a1a1a; color: #e0e0e0; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #111; }
  ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
  input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

const S = {
  root: { display: "flex", height: "100vh", background: "#0d0d0d", fontFamily: "'DM Mono', monospace", color: "#e0e0e0", overflow: "hidden" },
  sidebar: { width: "220px", minWidth: "220px", background: "#111", borderRight: "1px solid #1e1e1e", display: "flex", flexDirection: "column", overflow: "hidden" },
  sidebarLogo: { display: "flex", alignItems: "center", gap: "10px", padding: "24px 20px 20px", borderBottom: "1px solid #1e1e1e" },
  logoIcon: { fontSize: "24px", color: "#e2c27d", lineHeight: 1 },
  logoText: { fontSize: "13px", fontWeight: "600", color: "#e2c27d", lineHeight: "1.3", fontFamily: "'Playfair Display', serif" },
  logoSub: { fontSize: "10px", color: "#888", fontFamily: "'DM Mono', monospace", fontWeight: 400 },
  sidebarSection: { fontSize: "9px", letterSpacing: "0.15em", color: "#555", padding: "16px 20px 6px", fontWeight: "500" },
  batchItem: { display: "flex", alignItems: "center", gap: "8px", padding: "9px 20px", cursor: "pointer", borderLeft: "2px solid transparent" },
  batchItemActive: { background: "rgba(226,194,125,0.08)", borderLeftColor: "#e2c27d" },
  batchDot: { width: "5px", height: "5px", borderRadius: "50%", background: "#444", flexShrink: 0 },
  batchItemName: { fontSize: "12px", color: "#ccc", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  batchDeleteBtn: { color: "#555", fontSize: "16px", lineHeight: 1, cursor: "pointer" },
  newBatchBtn: { margin: "12px 16px", padding: "8px 12px", background: "transparent", border: "1px dashed #333", borderRadius: "6px", color: "#888", fontSize: "11px", cursor: "pointer", fontFamily: "'DM Mono', monospace" },
  sidebarFooter: { marginTop: "auto", padding: "16px 20px", fontSize: "10px", color: "#444", borderTop: "1px solid #1a1a1a", lineHeight: "1.6" },
  main: { flex: 1, overflow: "auto", background: "#0d0d0d" },
  centerPage: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "16px", padding: "40px" },
  heroIcon: { fontSize: "56px", color: "#e2c27d", lineHeight: 1, display: "inline-block" },
  heroTitle: { fontFamily: "'Playfair Display', serif", fontSize: "32px", color: "#e2c27d", textAlign: "center" },
  heroSub: { color: "#666", fontSize: "13px", textAlign: "center", maxWidth: "360px", lineHeight: "1.6" },
  heroCta: { padding: "10px 24px", background: "#e2c27d", color: "#0d0d0d", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "700", fontFamily: "'DM Mono', monospace" },
  pageTitle: { fontFamily: "'Playfair Display', serif", fontSize: "26px", color: "#e2c27d" },
  pageSub: { color: "#666", fontSize: "13px" },
  inputRow: { display: "flex", gap: "10px", alignItems: "center" },
  bigInput: { padding: "10px 16px", background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: "6px", color: "#e0e0e0", fontSize: "14px", fontFamily: "'DM Mono', monospace", outline: "none", width: "280px" },
  batchView: { padding: "32px 32px 60px", minHeight: "100%" },
  batchHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" },
  batchTitle: { fontFamily: "'Playfair Display', serif", fontSize: "28px", color: "#e2c27d", lineHeight: 1 },
  batchDate: { fontSize: "11px", color: "#555", display: "block", marginTop: "6px" },
  membersBtn: { padding: "8px 16px", background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: "6px", color: "#ccc", cursor: "pointer", fontSize: "12px", fontFamily: "'DM Mono', monospace" },
  commitBtn: { padding: "8px 18px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontFamily: "'DM Mono', monospace", fontWeight: "600", transition: "all 0.2s" },
  commitBtnActive: { background: "#e2c27d", color: "#0d0d0d" },
  commitBtnDisabled: { background: "#1a1a1a", color: "#444", border: "1px solid #2a2a2a", cursor: "default" },
  dirtyBanner: { background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", padding: "10px 14px", fontSize: "12px", color: "#f59e0b", marginBottom: "16px" },
  statsBar: { display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" },
  statCard: { flex: "1 1 100px", background: "#111", border: "1px solid", borderRadius: "10px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "4px" },
  statVal: { fontSize: "26px", fontFamily: "'Playfair Display', serif", lineHeight: 1 },
  statLbl: { fontSize: "10px", color: "#555", letterSpacing: "0.08em" },
  memberPanel: { background: "#111", border: "1px solid #2e2e2e", borderRadius: "10px", padding: "16px", marginBottom: "20px" },
  memberPanelHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" },
  closeBtn: { background: "none", border: "none", color: "#666", fontSize: "20px", cursor: "pointer", lineHeight: 1 },
  memberList: { display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px", minHeight: "20px" },
  memberChip: { display: "flex", alignItems: "center", gap: "6px", background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: "20px", padding: "4px 10px 4px 6px" },
  memberAvatar: { width: "22px", height: "22px", background: "#e2c27d22", border: "1px solid #e2c27d44", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#e2c27d", fontWeight: "600" },
  memberChipName: { fontSize: "12px", color: "#ccc" },
  memberMiniStats: { fontSize: "10px", color: "#555" },
  removeMember: { background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "14px", lineHeight: 1, padding: "0 2px" },
  addMemberRow: { display: "flex", gap: "8px" },
  memberInput: { flex: 1, padding: "7px 12px", background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: "6px", color: "#e0e0e0", fontSize: "12px", fontFamily: "'DM Mono', monospace", outline: "none" },
  addMemberBtn: { padding: "7px 14px", background: "#e2c27d22", border: "1px solid #e2c27d44", borderRadius: "6px", color: "#e2c27d", cursor: "pointer", fontSize: "12px", fontFamily: "'DM Mono', monospace" },
  tableWrap: { overflowX: "auto", background: "#111", border: "1px solid #1e1e1e", borderRadius: "10px", marginBottom: "14px" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: "900px" },
  th: { padding: "10px 12px", textAlign: "left", fontSize: "9px", letterSpacing: "0.12em", color: "#555", borderBottom: "1px solid #1e1e1e", fontWeight: "500", background: "#0f0f0f", whiteSpace: "nowrap" },
  tr: { borderBottom: "1px solid #191919" },
  trDirty: { borderLeft: "2px solid #f59e0b44" },
  td: { padding: "8px 12px", fontSize: "12px", verticalAlign: "middle" },
  slNo: { width: "24px", height: "24px", background: "#1a1a1a", borderRadius: "4px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#555" },
  dirtyDot: { display: "inline-block", width: "5px", height: "5px", borderRadius: "50%", background: "#f59e0b", marginLeft: "4px", verticalAlign: "middle" },
  cellText: { display: "block", color: "#ddd", cursor: "text" },
  cellInput: { background: "#1a1a1a", border: "1px solid #e2c27d66", borderRadius: "4px", color: "#e0e0e0", padding: "3px 6px", fontSize: "12px", outline: "none", fontFamily: "'DM Mono', monospace", width: "100%" },
  placeholder: { color: "#3a3a3a", fontStyle: "italic" },
  selectCell: { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "5px", color: "#ccc", padding: "4px 6px", fontSize: "11px", cursor: "pointer", outline: "none", fontFamily: "'DM Mono', monospace", maxWidth: "130px" },
  countBadge: { display: "inline-block", padding: "2px 8px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "10px", fontSize: "11px", color: "#aaa", cursor: "text" },
  rowDelete: { background: "none", border: "none", color: "#3a3a3a", cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "2px 4px" },
  emptyTable: { textAlign: "center", padding: "40px", color: "#444", fontSize: "13px" },
  addEventBtn: { padding: "8px 20px", background: "transparent", border: "1px dashed #2e2e2e", borderRadius: "6px", color: "#666", cursor: "pointer", fontSize: "12px", fontFamily: "'DM Mono', monospace", marginBottom: "32px" },
  memberSummary: { marginTop: "8px" },
  sectionLabel: { fontSize: "9px", letterSpacing: "0.15em", color: "#555", marginBottom: "12px", fontWeight: "500" },
  memberCards: { display: "flex", gap: "12px", flexWrap: "wrap" },
  memberCard: { background: "#111", border: "1px solid #1e1e1e", borderRadius: "10px", padding: "16px", minWidth: "160px", flex: "1 1 160px" },
  memberCardAvatar: { width: "32px", height: "32px", background: "#e2c27d22", border: "1px solid #e2c27d44", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "#e2c27d", fontWeight: "700", marginBottom: "8px", fontFamily: "'Playfair Display', serif" },
  memberCardName: { fontSize: "13px", color: "#e0e0e0", marginBottom: "12px", fontWeight: "500" },
  memberCardStats: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" },
  memberStat: { display: "flex", flexDirection: "column", gap: "2px" },
  memberStatVal: { fontSize: "18px", color: "#e2c27d", fontFamily: "'Playfair Display', serif", lineHeight: 1 },
  memberStatLbl: { fontSize: "9px", color: "#555", letterSpacing: "0.08em" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modal: { background: "#161616", border: "1px solid #2e2e2e", borderRadius: "12px", padding: "28px", maxWidth: "360px", width: "90%" },
  cancelBtn: { flex: 1, padding: "9px", background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: "6px", color: "#aaa", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "12px" },
  deleteConfirmBtn: { flex: 1, padding: "9px", background: "#f87171", border: "none", borderRadius: "6px", color: "#1a1a1a", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "12px", fontWeight: "700" },
};
