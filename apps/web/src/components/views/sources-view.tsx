"use client";

import { useState } from "react";
import {
  graphData as initialGraph,
  partnerDirectory as initialPartners,
  getPartner,
  type GraphCapability,
  type GraphExperience,
  type GraphCredential,
  type GraphPerson,
  type Partner,
} from "@/lib/mock-data";
import { Modal, FormField, TextInput, TextArea, SelectInput, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { DocumentDropzone } from "@/components/pursuit/document-dropzone";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

type TabId = "capabilities" | "experience" | "credentials" | "people" | "partners";

const PARTNER_TYPES = [
  { value: "Prime", label: "Prime" },
  { value: "JV", label: "JV (Joint Venture)" },
  { value: "Subcontractor", label: "Subcontractor" },
];

export function SourcesView() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>("capabilities");
  const [searchQ, setSearchQ] = useState("");

  const [capabilities, setCapabilities] = useState<GraphCapability[]>(initialGraph.capabilities);
  const [experience, setExperience] = useState<GraphExperience[]>(initialGraph.experience);
  const [credentials, setCredentials] = useState<GraphCredential[]>(initialGraph.credentials);
  const [people, setPeople] = useState<GraphPerson[]>(initialGraph.people);
  const [partners, setPartners] = useState<Partner[]>(() =>
    initialPartners.map(p => ({
      ...p,
      type: p.id === "PTR-U" ? "Prime" : p.type.includes("Consortium") ? "Prime" : "Subcontractor",
    }))
  );

  // Add modals
  const [addCapOpen, setAddCapOpen] = useState(false);
  const [capName, setCapName] = useState("");
  const [capPartner, setCapPartner] = useState("");

  const [addExpOpen, setAddExpOpen] = useState(false);
  const [expName, setExpName] = useState("");
  const [expTech, setExpTech] = useState("");
  const [expPartner, setExpPartner] = useState("");

  const [addCredOpen, setAddCredOpen] = useState(false);
  const [credName, setCredName] = useState("");
  const [credType, setCredType] = useState("Certification");
  const [credPartner, setCredPartner] = useState("");
  const [credExpiration, setCredExpiration] = useState("");

  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [personName, setPersonName] = useState("");
  const [personRole, setPersonRole] = useState("");
  const [personPartner, setPersonPartner] = useState("");
  const [personExpertise, setPersonExpertise] = useState("");

  const [addPartnerOpen, setAddPartnerOpen] = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [partnerType, setPartnerType] = useState("Subcontractor");
  const [partnerWebsite, setPartnerWebsite] = useState("");
  const [partnerSourceLink, setPartnerSourceLink] = useState("");
  const [partnerFiles, setPartnerFiles] = useState<File[]>([]);

  // Detail/edit modals
  const [detailPartner, setDetailPartner] = useState<Partner | null>(null);
  const [editPartner, setEditPartner] = useState<Partner | null>(null);
  const [editPartnerName, setEditPartnerName] = useState("");
  const [editPartnerType, setEditPartnerType] = useState("");
  const [editPartnerWebsite, setEditPartnerWebsite] = useState("");

  const [detailCap, setDetailCap] = useState<GraphCapability | null>(null);
  const [detailExp, setDetailExp] = useState<GraphExperience | null>(null);
  const [detailCred, setDetailCred] = useState<GraphCredential | null>(null);
  const [detailPerson, setDetailPerson] = useState<GraphPerson | null>(null);

  const [showArchived, setShowArchived] = useState(false);

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "capabilities", label: "Capabilities", count: capabilities.filter(c => showArchived || c.status !== "Archived").length },
    { id: "experience", label: "Experience", count: experience.filter(e => showArchived || e.status !== "Archived").length },
    { id: "credentials", label: "Credentials", count: credentials.filter(c => showArchived || c.status !== "Archived").length },
    { id: "people", label: "People", count: people.filter(p => showArchived || p.status !== "Archived").length },
    { id: "partners", label: "Partners", count: partners.filter(p => showArchived || p.status !== "Archived").length },
  ];

  const activePartners = partners.filter(p => p.status !== "Archived");
  const partnerOptions = activePartners.map(p => ({ value: p.id, label: p.name }));
  const partnerName2 = (id: string) => partners.find(p => p.id === id)?.name ?? id;

  // CRUD handlers
  function handleAddCapability() {
    if (!capName.trim()) return;
    const id = `CAP-${String(capabilities.length + 300).padStart(4, "0")}`;
    setCapabilities(prev => [...prev, {
      id, name: capName.trim(), partners: capPartner ? [capPartner] : [], status: "Pending", updated: new Date().toISOString().slice(0, 10),
    }]);
    toast(`Capability "${capName.trim()}" added`, "success");
    setAddCapOpen(false);
    setCapName(""); setCapPartner("");
  }

  function handleAddExperience() {
    if (!expName.trim()) return;
    const id = `EXP-${String(experience.length + 600).padStart(4, "0")}`;
    setExperience(prev => [...prev, {
      id, name: expName.trim(), partners: expPartner ? [expPartner] : [], capabilities: [], technologies: expTech.split(",").map(s => s.trim()).filter(Boolean), status: "Pending re-validation", updated: new Date().toISOString().slice(0, 10),
    }]);
    toast(`Experience "${expName.trim()}" added`, "success");
    setAddExpOpen(false);
    setExpName(""); setExpTech(""); setExpPartner("");
  }

  function handleAddCredential() {
    if (!credName.trim()) return;
    const id = `CRED-${String(credentials.length + 40).padStart(3, "0")}`;
    setCredentials(prev => [...prev, {
      id, name: credName.trim(), credType, partner: credPartner || "PTR-U", scope: "", expiration: credExpiration || "TBD", status: "Pending", updated: new Date().toISOString().slice(0, 10),
    }]);
    toast(`Credential "${credName.trim()}" added`, "success");
    setAddCredOpen(false);
    setCredName(""); setCredExpiration("");
  }

  function handleAddPerson() {
    if (!personName.trim()) return;
    const id = `PPL-${String(people.length + 130)}`;
    setPeople(prev => [...prev, {
      id, name: personName.trim(), partner: personPartner || "PTR-U", role: personRole, skills: [], technologies: [], expertise: personExpertise, projectHistory: [], status: "Pending", updated: new Date().toISOString().slice(0, 10),
    }]);
    toast(`"${personName.trim()}" added to people registry`, "success");
    setAddPersonOpen(false);
    setPersonName(""); setPersonRole(""); setPersonExpertise("");
  }

  function handleAddPartner() {
    if (!partnerName.trim()) return;
    const id = `PTR-${partnerName.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 4)}`;
    setPartners(prev => [...prev, {
      id, name: partnerName.trim(), type: partnerType, website: partnerWebsite, repo: partnerSourceLink || "—", contact: "—", status: "Active", teamingAgreementSigned: false, accessTier: null, covers: [], note: "",
    }]);
    if (partnerFiles.length > 0) {
      toast(`Partner "${partnerName.trim()}" added — ${partnerFiles.length} document(s) queued for ingestion`, "success");
    } else {
      toast(`Partner "${partnerName.trim()}" added`, "success");
    }
    setAddPartnerOpen(false);
    setPartnerName(""); setPartnerWebsite(""); setPartnerSourceLink(""); setPartnerFiles([]);
  }

  function handleArchivePartner(partnerId: string) {
    setPartners(prev => prev.map(p => p.id === partnerId ? { ...p, status: "Archived" } : p));
    setCapabilities(prev => prev.map(c => {
      if (!c.partners.includes(partnerId)) return c;
      const remaining = c.partners.filter(pid => pid !== partnerId);
      return remaining.length === 0 ? { ...c, partners: remaining, status: "Archived" } : { ...c, partners: remaining };
    }));
    setExperience(prev => prev.map(e => {
      if (!e.partners.includes(partnerId)) return e;
      const remaining = e.partners.filter(pid => pid !== partnerId);
      return remaining.length === 0 ? { ...e, partners: remaining, status: "Archived" } : { ...e, partners: remaining };
    }));
    setCredentials(prev => prev.map(c => c.partner === partnerId ? { ...c, status: "Archived" } : c));
    setPeople(prev => prev.map(p => p.partner === partnerId ? { ...p, status: "Archived" } : p));
    toast("Partner archived — sole-associated items archived as well", "success");
    setDetailPartner(null);
  }

  function openEditPartner(p: Partner) {
    setEditPartner(p);
    setEditPartnerName(p.name);
    setEditPartnerType(p.type);
    setEditPartnerWebsite(p.website);
  }

  function handleSavePartner() {
    if (!editPartner || !editPartnerName.trim()) return;
    setPartners(prev => prev.map(p =>
      p.id === editPartner.id ? { ...p, name: editPartnerName.trim(), type: editPartnerType, website: editPartnerWebsite } : p
    ));
    toast("Partner updated", "success");
    setEditPartner(null);
  }

  function handleDeleteItem(type: string, id: string) {
    if (type === "capability") setCapabilities(prev => prev.filter(c => c.id !== id));
    else if (type === "experience") setExperience(prev => prev.filter(e => e.id !== id));
    else if (type === "credential") setCredentials(prev => prev.filter(c => c.id !== id));
    else if (type === "person") setPeople(prev => prev.filter(p => p.id !== id));
    toast("Item deleted", "success");
  }

  const filterItem = (name: string, id: string) =>
    !searchQ || name.toLowerCase().includes(searchQ.toLowerCase()) || id.toLowerCase().includes(searchQ.toLowerCase());

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="oe-page-title">Capability Sources</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The Capability & Experience Graph — the single source of truth for what the consortium can deliver (I1, CEG-04).
        </p>
      </div>

      {/* Tab bar + search + add */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-4">
        <div className="bg-muted/60 inline-flex p-1 rounded-xl gap-0.5 overflow-x-auto oe-touch-scroll max-w-full">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSearchQ(""); }}
              className={cn(
                "px-3 sm:px-4 py-2 text-xs font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap",
                tab === t.id
                  ? "bg-card text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              <span className="ml-1.5 text-[10px] font-mono opacity-60">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto flex-wrap">
          <input
            type="text"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder={`Search ${tab}…`}
            className="oe-field text-[11px] flex-1 lg:w-48 lg:flex-none"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="rounded" />
            Show archived
          </label>
          <button
            onClick={() => {
              if (tab === "capabilities") setAddCapOpen(true);
              else if (tab === "experience") setAddExpOpen(true);
              else if (tab === "credentials") setAddCredOpen(true);
              else if (tab === "people") setAddPersonOpen(true);
              else if (tab === "partners") setAddPartnerOpen(true);
            }}
            className="text-xs font-semibold px-3.5 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm whitespace-nowrap"
          >
            + Add {tab === "capabilities" ? "Capability" : tab === "experience" ? "Experience" : tab === "credentials" ? "Credential" : tab === "people" ? "Person" : "Partner"}
          </button>
        </div>
      </div>

      {/* Capabilities tab */}
      {tab === "capabilities" && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="oe-table-header">
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">ID</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Capability</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Partners</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Status</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Updated</th>
                </tr>
              </thead>
              <tbody>
                {capabilities.filter(c => (showArchived || c.status !== "Archived") && filterItem(c.name, c.id)).map(c => (
                  <tr key={c.id} className="oe-table-row border-b border-border last:border-b-0 cursor-pointer" onClick={() => setDetailCap(c)}>
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{c.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.partners.map(id => partnerName2(id)).join(", ") || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
                        c.status === "Verified" ? "oe-status-go" : c.status === "Archived" ? "oe-status-closed" : "oe-status-cond"
                      )}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.updated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Experience tab */}
      {tab === "experience" && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="oe-table-header">
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">ID</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Experience</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Partners</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Technologies</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Status</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Updated</th>
                </tr>
              </thead>
              <tbody>
                {experience.filter(e => (showArchived || e.status !== "Archived") && filterItem(e.name, e.id)).map(e => (
                  <tr key={e.id} className="oe-table-row border-b border-border last:border-b-0 cursor-pointer" onClick={() => setDetailExp(e)}>
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{e.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{e.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.partners.map(id => partnerName2(id)).join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{e.technologies.join(", ")}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
                        e.status === "Verified" ? "oe-status-go" : e.status === "Archived" ? "oe-status-closed" : "oe-status-cond"
                      )}>{e.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{e.updated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Credentials tab */}
      {tab === "credentials" && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="oe-table-header">
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">ID</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Credential</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Type</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Partner</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Expiration</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {credentials.filter(c => (showArchived || c.status !== "Archived") && filterItem(c.name, c.id)).map(c => (
                  <tr key={c.id} className="oe-table-row border-b border-border last:border-b-0 cursor-pointer" onClick={() => setDetailCred(c)}>
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{c.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.credType}</td>
                    <td className="px-4 py-3 text-muted-foreground">{partnerName2(c.partner)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.expiration}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
                        c.status === "Verified" ? "oe-status-go" : c.status === "Archived" ? "oe-status-closed" :
                        c.status.includes("Partner") ? "oe-status-trace" : "oe-status-cond"
                      )}>{c.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* People tab */}
      {tab === "people" && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="oe-table-header">
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">ID</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Name</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Partner</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Role</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5 hidden xl:table-cell">Expertise</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {people.filter(p => (showArchived || p.status !== "Archived") && filterItem(p.name, p.id)).map(p => (
                  <tr key={p.id} className="oe-table-row border-b border-border last:border-b-0 cursor-pointer" onClick={() => setDetailPerson(p)}>
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{p.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{partnerName2(p.partner)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.role}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[400px] truncate hidden xl:table-cell">{p.expertise}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
                        p.status === "Verified" ? "oe-status-go" : p.status === "Archived" ? "oe-status-closed" : "oe-status-cond"
                      )}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Partners tab */}
      {tab === "partners" && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="oe-table-header">
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Partner</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Type</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Website</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Teaming Agreement</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Gap Coverage</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Status</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {partners.filter(p => (showArchived || p.status !== "Archived") && filterItem(p.name, p.id)).map(p => (
                  <tr key={p.id} className="oe-table-row border-b border-border last:border-b-0 cursor-pointer" onClick={() => setDetailPartner(p)}>
                    <td className="px-4 py-3 font-semibold text-foreground">{p.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.type}</td>
                    <td className="px-4 py-3 text-xs">
                      {p.website && p.website !== "—" ? (
                        <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" onClick={e => e.stopPropagation()}>{p.website}</a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {p.teamingAgreementSigned === true ? (
                        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-go">Signed</span>
                      ) : p.teamingAgreementSigned === false ? (
                        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-cond">Pending</span>
                      ) : <span className="text-muted-foreground">N/A</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.covers.length > 0 ? p.covers.join(", ") : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
                        p.status === "Active" ? "oe-status-go" : p.status === "Archived" ? "oe-status-closed" : "oe-status-pending"
                      )}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5">
                        <button onClick={() => openEditPartner(p)} className="text-[10px] font-medium px-2 py-1 rounded border border-input bg-card text-foreground cursor-pointer hover:bg-secondary">Edit</button>
                        {p.status !== "Archived" && (
                          <button onClick={() => handleArchivePartner(p.id)} className="text-[10px] font-medium px-2 py-1 rounded border border-input bg-card text-destructive cursor-pointer hover:bg-destructive/10">Archive</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Partner Detail Modal */}
      <Modal open={detailPartner !== null} onClose={() => setDetailPartner(null)} title={detailPartner?.name ?? "Partner Details"} wide>
        {detailPartner && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-muted-foreground">Type:</span> <strong>{detailPartner.type}</strong></div>
              <div><span className="text-muted-foreground">Status:</span> <strong>{detailPartner.status}</strong></div>
              <div><span className="text-muted-foreground">Website:</span> {detailPartner.website !== "—" ? <a href={detailPartner.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{detailPartner.website}</a> : "—"}</div>
              <div><span className="text-muted-foreground">Contact:</span> {detailPartner.contact}</div>
            </div>
            {detailPartner.note && <p className="text-xs text-muted-foreground">{detailPartner.note}</p>}
            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold mb-2">Capabilities</h4>
              <div className="space-y-1">{capabilities.filter(c => c.partners.includes(detailPartner.id)).map(c => (
                <div key={c.id} className="text-xs text-foreground">{c.id} — {c.name}</div>
              ))}</div>
              {capabilities.filter(c => c.partners.includes(detailPartner.id)).length === 0 && <div className="text-xs text-muted-foreground italic">None</div>}
            </div>
            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold mb-2">Experience</h4>
              <div className="space-y-1">{experience.filter(e => e.partners.includes(detailPartner.id)).map(e => (
                <div key={e.id} className="text-xs text-foreground">{e.id} — {e.name}</div>
              ))}</div>
              {experience.filter(e => e.partners.includes(detailPartner.id)).length === 0 && <div className="text-xs text-muted-foreground italic">None</div>}
            </div>
            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold mb-2">Credentials</h4>
              <div className="space-y-1">{credentials.filter(c => c.partner === detailPartner.id).map(c => (
                <div key={c.id} className="text-xs text-foreground">{c.id} — {c.name} ({c.credType})</div>
              ))}</div>
              {credentials.filter(c => c.partner === detailPartner.id).length === 0 && <div className="text-xs text-muted-foreground italic">None</div>}
            </div>
            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold mb-2">People</h4>
              <div className="space-y-1">{people.filter(p => p.partner === detailPartner.id).map(p => (
                <div key={p.id} className="text-xs text-foreground">{p.id} — {p.name} ({p.role})</div>
              ))}</div>
              {people.filter(p => p.partner === detailPartner.id).length === 0 && <div className="text-xs text-muted-foreground italic">None</div>}
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-border">
              <button onClick={() => { toast("Refreshing partner profile from source…", "info"); }} className="text-xs font-medium px-3 py-1.5 rounded-md border border-input bg-card text-foreground cursor-pointer hover:bg-secondary">
                Refresh Profile
              </button>
              <SecondaryButton onClick={() => setDetailPartner(null)}>Close</SecondaryButton>
            </div>
          </div>
        )}
      </Modal>

      {/* Item Detail Modals */}
      <Modal open={detailCap !== null} onClose={() => setDetailCap(null)} title={detailCap?.name ?? "Capability"}>
        {detailCap && (
          <div className="space-y-3 text-xs">
            <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{detailCap.id}</span></div>
            <div><span className="text-muted-foreground">Partners:</span> {detailCap.partners.map(id => partnerName2(id)).join(", ") || "—"}</div>
            <div><span className="text-muted-foreground">Status:</span> {detailCap.status}</div>
            <div><span className="text-muted-foreground">Updated:</span> {detailCap.updated}</div>
            <div className="flex justify-between pt-2">
              <button onClick={() => { handleDeleteItem("capability", detailCap.id); setDetailCap(null); }} className="text-xs text-destructive cursor-pointer hover:underline">Delete</button>
              <SecondaryButton onClick={() => setDetailCap(null)}>Close</SecondaryButton>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={detailExp !== null} onClose={() => setDetailExp(null)} title={detailExp?.name ?? "Experience"}>
        {detailExp && (
          <div className="space-y-3 text-xs">
            <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{detailExp.id}</span></div>
            <div><span className="text-muted-foreground">Partners:</span> {detailExp.partners.map(id => partnerName2(id)).join(", ") || "—"}</div>
            <div><span className="text-muted-foreground">Technologies:</span> {detailExp.technologies.join(", ")}</div>
            <div><span className="text-muted-foreground">Status:</span> {detailExp.status}</div>
            <div className="flex justify-between pt-2">
              <button onClick={() => { handleDeleteItem("experience", detailExp.id); setDetailExp(null); }} className="text-xs text-destructive cursor-pointer hover:underline">Delete</button>
              <SecondaryButton onClick={() => setDetailExp(null)}>Close</SecondaryButton>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={detailCred !== null} onClose={() => setDetailCred(null)} title={detailCred?.name ?? "Credential"}>
        {detailCred && (
          <div className="space-y-3 text-xs">
            <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{detailCred.id}</span></div>
            <div><span className="text-muted-foreground">Type:</span> {detailCred.credType}</div>
            <div><span className="text-muted-foreground">Partner:</span> {partnerName2(detailCred.partner)}</div>
            <div><span className="text-muted-foreground">Expiration:</span> {detailCred.expiration}</div>
            <div><span className="text-muted-foreground">Status:</span> {detailCred.status}</div>
            <div className="flex justify-between pt-2">
              <button onClick={() => { handleDeleteItem("credential", detailCred.id); setDetailCred(null); }} className="text-xs text-destructive cursor-pointer hover:underline">Delete</button>
              <SecondaryButton onClick={() => setDetailCred(null)}>Close</SecondaryButton>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={detailPerson !== null} onClose={() => setDetailPerson(null)} title={detailPerson?.name ?? "Person"}>
        {detailPerson && (
          <div className="space-y-3 text-xs">
            <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{detailPerson.id}</span></div>
            <div><span className="text-muted-foreground">Partner:</span> {partnerName2(detailPerson.partner)}</div>
            <div><span className="text-muted-foreground">Role:</span> {detailPerson.role}</div>
            <div><span className="text-muted-foreground">Expertise:</span> {detailPerson.expertise}</div>
            <div><span className="text-muted-foreground">Status:</span> {detailPerson.status}</div>
            <div className="flex justify-between pt-2">
              <button onClick={() => { handleDeleteItem("person", detailPerson.id); setDetailPerson(null); }} className="text-xs text-destructive cursor-pointer hover:underline">Delete</button>
              <SecondaryButton onClick={() => setDetailPerson(null)}>Close</SecondaryButton>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Partner Modal */}
      <Modal open={editPartner !== null} onClose={() => setEditPartner(null)} title="Edit Partner">
        <div className="space-y-4">
          <FormField label="Partner name">
            <TextInput value={editPartnerName} onChange={setEditPartnerName} />
          </FormField>
          <FormField label="Type">
            <SelectInput value={editPartnerType} onChange={setEditPartnerType} options={PARTNER_TYPES} />
          </FormField>
          <FormField label="Website">
            <TextInput value={editPartnerWebsite} onChange={setEditPartnerWebsite} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setEditPartner(null)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSavePartner} disabled={!editPartnerName.trim()}>Save</PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* Add Capability Modal */}
      <Modal open={addCapOpen} onClose={() => setAddCapOpen(false)} title="Add Capability">
        <div className="space-y-4">
          <FormField label="Capability name">
            <TextInput value={capName} onChange={setCapName} placeholder="e.g. Cloud Infrastructure Security" />
          </FormField>
          <FormField label="Primary partner">
            <SelectInput value={capPartner} onChange={setCapPartner} options={[{ value: "", label: "Select partner…" }, ...partnerOptions]} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setAddCapOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleAddCapability} disabled={!capName.trim()}>Add Capability</PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* Add Experience Modal */}
      <Modal open={addExpOpen} onClose={() => setAddExpOpen(false)} title="Add Experience">
        <div className="space-y-4">
          <FormField label="Experience / project name">
            <TextInput value={expName} onChange={setExpName} placeholder="e.g. State of Oregon — Benefits Platform Migration" />
          </FormField>
          <FormField label="Partner">
            <SelectInput value={expPartner} onChange={setExpPartner} options={[{ value: "", label: "Select partner…" }, ...partnerOptions]} />
          </FormField>
          <FormField label="Technologies (comma-separated)">
            <TextInput value={expTech} onChange={setExpTech} placeholder="e.g. AWS GovCloud, PostgreSQL, Databricks" />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setAddExpOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleAddExperience} disabled={!expName.trim()}>Add Experience</PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* Add Credential Modal */}
      <Modal open={addCredOpen} onClose={() => setAddCredOpen(false)} title="Add Credential">
        <div className="space-y-4">
          <FormField label="Credential name">
            <TextInput value={credName} onChange={setCredName} placeholder="e.g. SOC 2 Type II" />
          </FormField>
          <FormField label="Type">
            <SelectInput value={credType} onChange={setCredType} options={[
              { value: "Certification", label: "Certification" }, { value: "Insurance", label: "Insurance" },
              { value: "Bonding", label: "Bonding" }, { value: "License", label: "License" },
            ]} />
          </FormField>
          <FormField label="Partner">
            <SelectInput value={credPartner} onChange={setCredPartner} options={[{ value: "", label: "Select partner…" }, ...partnerOptions]} />
          </FormField>
          <FormField label="Expiration date">
            <TextInput value={credExpiration} onChange={setCredExpiration} placeholder="e.g. 2027-06-01" />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setAddCredOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleAddCredential} disabled={!credName.trim()}>Add Credential</PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* Add Person Modal */}
      <Modal open={addPersonOpen} onClose={() => setAddPersonOpen(false)} title="Add Person">
        <div className="space-y-4">
          <FormField label="Full name">
            <TextInput value={personName} onChange={setPersonName} placeholder="e.g. Sarah Chen, PMP" />
          </FormField>
          <FormField label="Role">
            <TextInput value={personRole} onChange={setPersonRole} placeholder="e.g. Senior Solutions Architect" />
          </FormField>
          <FormField label="Partner organization">
            <SelectInput value={personPartner} onChange={setPersonPartner} options={[{ value: "", label: "Select partner…" }, ...partnerOptions]} />
          </FormField>
          <FormField label="Expertise summary">
            <TextInput value={personExpertise} onChange={setPersonExpertise} placeholder="e.g. 10 years cloud migration experience…" />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setAddPersonOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleAddPerson} disabled={!personName.trim()}>Add Person</PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* Add Partner Modal */}
      <Modal open={addPartnerOpen} onClose={() => setAddPartnerOpen(false)} title="Add Partner" wide>
        <div className="space-y-4">
          <FormField label="Partner name">
            <TextInput value={partnerName} onChange={setPartnerName} placeholder="e.g. Apex Federal Solutions" />
          </FormField>
          <FormField label="Type">
            <SelectInput value={partnerType} onChange={setPartnerType} options={PARTNER_TYPES} />
          </FormField>
          <FormField label="Website (optional)">
            <TextInput value={partnerWebsite} onChange={setPartnerWebsite} placeholder="e.g. https://example.com" />
          </FormField>
          <FormField label="Source link for capabilities ingestion (optional)">
            <TextInput value={partnerSourceLink} onChange={setPartnerSourceLink} placeholder="e.g. https://example.com/capabilities" />
          </FormField>
          <FormField label="Upload documents (capabilities statement, resumes, etc.)">
            <DocumentDropzone files={partnerFiles} onChange={setPartnerFiles} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setAddPartnerOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleAddPartner} disabled={!partnerName.trim()}>Add Partner</PrimaryButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
