"use client";

import { useState } from "react";
import {
  type GraphCapability,
  type GraphCredential,
  type GraphData,
  type GraphExperience,
  type GraphPerson,
  type Partner,
  type Pursuit,
  type ResponseActionItem,
} from "@/lib/mock-data";
import { Modal, FormField, TextInput, TextArea, SelectInput, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { DocumentDropzone } from "@/components/pursuit/document-dropzone";
import { ActionItemResponseModal } from "@/components/action-items/action-item-response-modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  applyPartnerIngest,
  applyResumeReplacement,
  ingestPartnerDocuments,
  type PartnerIngestKind,
  type PartnerIngestResult,
} from "@/lib/partner-ingest";

type TabId = "capabilities" | "experience" | "credentials" | "people" | "partners";

const PARTNER_TYPES = [
  { value: "Prime", label: "Prime" },
  { value: "JV", label: "JV (Joint Venture)" },
  { value: "Subcontractor", label: "Subcontractor" },
];

const TEAMING_OPTIONS: { value: "na" | "pending" | "signed"; label: string; flag: boolean | null }[] = [
  { value: "na", label: "N/A", flag: null },
  { value: "pending", label: "Pending", flag: false },
  { value: "signed", label: "Signed", flag: true },
];

function teamingValue(flag: boolean | null): "na" | "pending" | "signed" {
  if (flag === true) return "signed";
  if (flag === false) return "pending";
  return "na";
}

function TeamingToggle({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (next: boolean | null) => void;
}) {
  return (
    <div className="inline-flex p-1 rounded-lg bg-muted/60 gap-0.5">
      {TEAMING_OPTIONS.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.flag)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer",
            teamingValue(value) === option.value
              ? "bg-card text-foreground shadow-sm font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PartnerMultiSelect({
  selected,
  options,
  onChange,
}: {
  selected: string[];
  options: { value: string; label: string }[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="border border-input rounded-md max-h-40 overflow-y-auto divide-y divide-border">
      {options.length === 0 && <div className="px-3 py-2 text-[11px] text-muted-foreground">No active partners</div>}
      {options.map(option => (
        <label key={option.value} className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-muted/40">
          <input
            type="checkbox"
            checked={selected.includes(option.value)}
            onChange={e => {
              onChange(e.target.checked ? [...selected, option.value] : selected.filter(id => id !== option.value));
            }}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export function SourcesView({
  partners,
  graph,
  allPursuits,
  onUpdatePartners,
  onUpdateGraph,
  onUpdatePursuit,
  onArchivePartner,
  onReinstatePartner,
}: {
  partners: Partner[];
  graph: GraphData;
  allPursuits: Record<string, Pursuit>;
  onUpdatePartners: (next: Partner[] | ((prev: Partner[]) => Partner[])) => void;
  onUpdateGraph: (next: GraphData | ((prev: GraphData) => GraphData)) => void;
  onUpdatePursuit: (pursuitId: string, updates: Partial<Pursuit>) => void;
  onArchivePartner?: (partnerId: string) => void;
  onReinstatePartner?: (partnerId: string) => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>("capabilities");
  const [searchQ, setSearchQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const capabilities = graph.capabilities;
  const experience = graph.experience;
  const credentials = graph.credentials;
  const people = graph.people;

  const [addCapOpen, setAddCapOpen] = useState(false);
  const [capName, setCapName] = useState("");
  const [capPartners, setCapPartners] = useState<string[]>([]);

  const [addExpOpen, setAddExpOpen] = useState(false);
  const [expName, setExpName] = useState("");
  const [expTech, setExpTech] = useState("");
  const [expServices, setExpServices] = useState("");
  const [expIndustry, setExpIndustry] = useState("");
  const [expSummary, setExpSummary] = useState("");
  const [expPartners, setExpPartners] = useState<string[]>([]);

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
  const [personIndustries, setPersonIndustries] = useState("");

  const [addPartnerOpen, setAddPartnerOpen] = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [partnerType, setPartnerType] = useState("Subcontractor");
  const [partnerWebsite, setPartnerWebsite] = useState("");
  const [partnerContact, setPartnerContact] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerSummary, setPartnerSummary] = useState("");
  const [partnerSourceLink, setPartnerSourceLink] = useState("");
  const [partnerTeaming, setPartnerTeaming] = useState<boolean | null>(null);
  const [capFiles, setCapFiles] = useState<File[]>([]);
  const [expFiles, setExpFiles] = useState<File[]>([]);
  const [credFiles, setCredFiles] = useState<File[]>([]);
  const [peopleFiles, setPeopleFiles] = useState<File[]>([]);
  const [ingestBusy, setIngestBusy] = useState(false);

  const [detailPartnerId, setDetailPartnerId] = useState<string | null>(null);
  const [editPartner, setEditPartner] = useState<Partner | null>(null);
  const [editPartnerName, setEditPartnerName] = useState("");
  const [editPartnerType, setEditPartnerType] = useState("");
  const [editPartnerWebsite, setEditPartnerWebsite] = useState("");
  const [editPartnerContact, setEditPartnerContact] = useState("");
  const [editPartnerEmail, setEditPartnerEmail] = useState("");
  const [editPartnerSummary, setEditPartnerSummary] = useState("");
  const [editPartnerTeaming, setEditPartnerTeaming] = useState<boolean | null>(null);
  const [editCapFiles, setEditCapFiles] = useState<File[]>([]);
  const [editExpFiles, setEditExpFiles] = useState<File[]>([]);
  const [editCredFiles, setEditCredFiles] = useState<File[]>([]);
  const [editPeopleFiles, setEditPeopleFiles] = useState<File[]>([]);

  const [detailCap, setDetailCap] = useState<GraphCapability | null>(null);
  const [detailExp, setDetailExp] = useState<GraphExperience | null>(null);
  const [detailCred, setDetailCred] = useState<GraphCredential | null>(null);
  const [detailPerson, setDetailPerson] = useState<GraphPerson | null>(null);
  const [editCap, setEditCap] = useState<GraphCapability | null>(null);
  const [editExp, setEditExp] = useState<GraphExperience | null>(null);
  const [editPerson, setEditPerson] = useState<GraphPerson | null>(null);
  const [editCapPartners, setEditCapPartners] = useState<string[]>([]);
  const [editExpPartners, setEditExpPartners] = useState<string[]>([]);
  const [editExpIndustry, setEditExpIndustry] = useState("");
  const [editExpTech, setEditExpTech] = useState("");
  const [editExpServices, setEditExpServices] = useState("");
  const [editExpSummary, setEditExpSummary] = useState("");
  const [editPersonRoles, setEditPersonRoles] = useState("");
  const [editPersonExpertise, setEditPersonExpertise] = useState("");
  const [editPersonIndustries, setEditPersonIndustries] = useState("");
  const [resumeFiles, setResumeFiles] = useState<File[]>([]);

  const [actionTarget, setActionTarget] = useState<{ pursuitId: string; item: ResponseActionItem } | null>(null);

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
  const detailPartner = detailPartnerId ? partners.find(p => p.id === detailPartnerId) ?? null : null;
  const liveCap = detailCap ? capabilities.find(item => item.id === detailCap.id) ?? detailCap : null;
  const liveExp = detailExp ? experience.find(item => item.id === detailExp.id) ?? detailExp : null;
  const liveCred = detailCred ? credentials.find(item => item.id === detailCred.id) ?? detailCred : null;
  const livePerson = detailPerson ? people.find(item => item.id === detailPerson.id) ?? detailPerson : null;

  async function ingestKinds(
    partnerId: string,
    batches: { kind: PartnerIngestKind; files: File[] }[],
  ) {
    const notes: string[] = [];
    const results: PartnerIngestResult[] = [];
    for (const batch of batches) {
      if (!batch.files.length) continue;
      const result = await ingestPartnerDocuments(batch.kind, batch.files);
      results.push(result);
      if (result.warning) toast(result.warning, "warning");
    }
    onUpdateGraph(prev => {
      let next = prev;
      notes.length = 0;
      for (const result of results) {
        const applied = applyPartnerIngest(next, partnerId, result);
        next = applied.graph;
        if (applied.added.length) notes.push(`added ${applied.added.length} ${result.kind}`);
        if (applied.merged.length) notes.push(`merged ${applied.merged.length} existing ${result.kind}`);
      }
      return next;
    });
    return notes;
  }

  function handleAddCapability() {
    if (!capName.trim()) return;
    const id = `CAP-${String(capabilities.length + 300).padStart(4, "0")}`;
    onUpdateGraph(prev => ({
      ...prev,
      capabilities: [...prev.capabilities, {
        id, name: capName.trim(), partners: capPartners, status: "Pending", updated: new Date().toISOString().slice(0, 10),
      }],
    }));
    toast(`Capability "${capName.trim()}" added`, "success");
    setAddCapOpen(false);
    setCapName(""); setCapPartners([]);
  }

  function handleAddExperience() {
    if (!expName.trim()) return;
    const id = `EXP-${String(experience.length + 600).padStart(4, "0")}`;
    onUpdateGraph(prev => ({
      ...prev,
      experience: [...prev.experience, {
        id,
        name: expName.trim(),
        partners: expPartners,
        capabilities: [],
        technologies: expTech.split(",").map(s => s.trim()).filter(Boolean),
        services: expServices.split(",").map(s => s.trim()).filter(Boolean),
        industry: expIndustry.trim(),
        summary: expSummary.trim(),
        status: "Pending re-validation",
        updated: new Date().toISOString().slice(0, 10),
      }],
    }));
    toast(`Experience "${expName.trim()}" added`, "success");
    setAddExpOpen(false);
    setExpName(""); setExpTech(""); setExpServices(""); setExpIndustry(""); setExpSummary(""); setExpPartners([]);
  }

  function handleAddCredential() {
    if (!credName.trim()) return;
    const id = `CRED-${String(credentials.length + 40).padStart(3, "0")}`;
    onUpdateGraph(prev => ({
      ...prev,
      credentials: [...prev.credentials, {
        id, name: credName.trim(), credType, partner: credPartner || "PTR-U", scope: "", expiration: credExpiration || "TBD",
        status: "Pending", updated: new Date().toISOString().slice(0, 10), documentText: "", documentFileName: "",
      }],
    }));
    toast(`Credential "${credName.trim()}" added`, "success");
    setAddCredOpen(false);
    setCredName(""); setCredExpiration("");
  }

  function handleAddPerson() {
    if (!personName.trim()) return;
    const roles = personRole.split(",").map(s => s.trim()).filter(Boolean);
    const id = `PPL-${String(people.length + 130)}`;
    onUpdateGraph(prev => ({
      ...prev,
      people: [...prev.people, {
        id,
        name: personName.trim(),
        partner: personPartner || "PTR-U",
        role: roles[0] ?? "",
        roles,
        skills: [],
        technologies: [],
        expertise: personExpertise,
        industries: personIndustries.split(",").map(s => s.trim()).filter(Boolean),
        projectHistory: [],
        status: "Pending",
        updated: new Date().toISOString().slice(0, 10),
        resumeText: "",
        resumeFileName: "",
      }],
    }));
    toast(`"${personName.trim()}" added to people registry`, "success");
    setAddPersonOpen(false);
    setPersonName(""); setPersonRole(""); setPersonExpertise(""); setPersonIndustries("");
  }

  async function handleAddPartner() {
    if (!partnerName.trim()) return;
    const id = `PTR-${partnerName.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 4)}${Date.now().toString().slice(-2)}`;
    const created: Partner = {
      id,
      name: partnerName.trim(),
      type: partnerType,
      website: partnerWebsite || "—",
      repo: partnerSourceLink || "—",
      contact: partnerContact.trim() || "—",
      contactEmail: partnerEmail.trim(),
      status: "Active",
      teamingAgreementSigned: partnerTeaming,
      accessTier: null,
      covers: [],
      note: partnerSummary.trim(),
      summary: partnerSummary.trim(),
      createdAt: new Date().toISOString().slice(0, 10),
    };
    onUpdatePartners(prev => [...prev, created]);
    setIngestBusy(true);
    try {
      const notes = await ingestKinds(id, [
        { kind: "capabilities", files: capFiles },
        { kind: "experience", files: expFiles },
        { kind: "credentials", files: credFiles },
        { kind: "people", files: peopleFiles },
      ]);
      toast(notes.length ? `Partner "${created.name}" added — ${notes.join("; ")}` : `Partner "${created.name}" added`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Partner added, but document ingest failed", "warning");
    } finally {
      setIngestBusy(false);
    }
    setAddPartnerOpen(false);
    setPartnerName(""); setPartnerWebsite(""); setPartnerSourceLink(""); setPartnerContact(""); setPartnerEmail(""); setPartnerSummary("");
    setPartnerTeaming(null);
    setCapFiles([]); setExpFiles([]); setCredFiles([]); setPeopleFiles([]);
  }

  function handleArchivePartner(partnerId: string) {
    if (onArchivePartner) onArchivePartner(partnerId);
    else {
      onUpdatePartners(prev => prev.map(p => p.id === partnerId ? { ...p, status: "Archived" } : p));
    }
    toast("Partner archived — sole-associated items archived as well", "success");
    setDetailPartnerId(null);
  }

  function handleReinstatePartner(partnerId: string) {
    if (onReinstatePartner) onReinstatePartner(partnerId);
    toast("Partner reinstated with full history", "success");
  }

  function openEditPartner(p: Partner) {
    setEditPartner(p);
    setEditPartnerName(p.name);
    setEditPartnerType(p.type);
    setEditPartnerWebsite(p.website === "—" ? "" : p.website);
    setEditPartnerContact(p.contact === "—" ? "" : p.contact);
    setEditPartnerEmail(p.contactEmail ?? "");
    setEditPartnerSummary(p.summary || p.note);
    setEditPartnerTeaming(p.teamingAgreementSigned);
    setEditCapFiles([]); setEditExpFiles([]); setEditCredFiles([]); setEditPeopleFiles([]);
  }

  async function handleSavePartner() {
    if (!editPartner || !editPartnerName.trim()) return;
    onUpdatePartners(prev => prev.map(p =>
      p.id === editPartner.id
        ? {
            ...p,
            name: editPartnerName.trim(),
            type: editPartnerType,
            website: editPartnerWebsite || "—",
            contact: editPartnerContact.trim() || "—",
            contactEmail: editPartnerEmail.trim(),
            summary: editPartnerSummary.trim(),
            note: editPartnerSummary.trim(),
            teamingAgreementSigned: editPartnerTeaming,
          }
        : p
    ));
    setIngestBusy(true);
    try {
      const notes = await ingestKinds(editPartner.id, [
        { kind: "capabilities", files: editCapFiles },
        { kind: "experience", files: editExpFiles },
        { kind: "credentials", files: editCredFiles },
        { kind: "people", files: editPeopleFiles },
      ]);
      toast(notes.length ? `Partner updated — ${notes.join("; ")}` : "Partner updated", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Partner saved, but document ingest failed", "warning");
    } finally {
      setIngestBusy(false);
    }
    setEditPartner(null);
  }

  function handleDeleteItem(type: string, id: string) {
    onUpdateGraph(prev => ({
      ...prev,
      capabilities: type === "capability" ? prev.capabilities.filter(c => c.id !== id) : prev.capabilities,
      experience: type === "experience" ? prev.experience.filter(e => e.id !== id) : prev.experience,
      credentials: type === "credential" ? prev.credentials.filter(c => c.id !== id) : prev.credentials,
      people: type === "person" ? prev.people.filter(p => p.id !== id) : prev.people,
    }));
    toast("Item deleted", "success");
  }

  function handleSaveCapability() {
    if (!editCap) return;
    onUpdateGraph(prev => ({
      ...prev,
      capabilities: prev.capabilities.map(c =>
        c.id === editCap.id ? { ...c, partners: editCapPartners, updated: new Date().toISOString().slice(0, 10) } : c
      ),
    }));
    toast("Capability updated", "success");
    setEditCap(null);
    setDetailCap(prev => prev ? { ...prev, partners: editCapPartners } : prev);
  }

  function handleSaveExperience() {
    if (!editExp) return;
    const next = {
      partners: editExpPartners,
      industry: editExpIndustry.trim(),
      technologies: editExpTech.split(",").map(s => s.trim()).filter(Boolean),
      services: editExpServices.split(",").map(s => s.trim()).filter(Boolean),
      summary: editExpSummary.trim(),
      updated: new Date().toISOString().slice(0, 10),
    };
    onUpdateGraph(prev => ({
      ...prev,
      experience: prev.experience.map(e => e.id === editExp.id ? { ...e, ...next } : e),
    }));
    toast("Experience updated", "success");
    setEditExp(null);
    setDetailExp(prev => prev ? { ...prev, ...next } : prev);
  }

  async function handleSavePerson() {
    if (!editPerson) return;
    const roles = editPersonRoles.split(",").map(s => s.trim()).filter(Boolean);
    let nextPerson: GraphPerson = {
      ...editPerson,
      roles,
      role: roles[0] ?? editPerson.role,
      expertise: editPersonExpertise,
      industries: editPersonIndustries.split(",").map(s => s.trim()).filter(Boolean),
      updated: new Date().toISOString().slice(0, 10),
    };
    if (resumeFiles[0]) {
      setIngestBusy(true);
      try {
        const result = await ingestPartnerDocuments("people", resumeFiles);
        if (result.people.length > 0) {
          nextPerson = applyResumeReplacement(nextPerson, result.people[0]!);
        }
        if (result.people.length > 1) {
          const additionalPeople = result.people.slice(1);
          onUpdateGraph(prev => {
            const stamp = new Date().toISOString().slice(0, 10);
            const existingIds = new Set(prev.people.map(p => p.id));
            let maxNum = prev.people
              .map(p => Number(p.id.replace(/\D/g, "")))
              .filter(n => Number.isFinite(n))
              .reduce((a, b) => Math.max(a, b), 100);
            const newPeople = additionalPeople.map(parsed => {
              maxNum += 1;
              const newPerson: GraphPerson = {
                id: `PPL-${String(maxNum).padStart(3, "0")}`,
                name: parsed.name,
                partner: editPerson.partner,
                role: parsed.roles[0] ?? "Contributor",
                roles: parsed.roles,
                skills: [],
                technologies: parsed.technologies,
                expertise: parsed.expertise,
                industries: parsed.industries,
                projectHistory: [],
                status: "Pending",
                updated: stamp,
                resumeText: parsed.resumeText,
                resumeFileName: parsed.resumeFileName,
              };
              return newPerson;
            });
            return { ...prev, people: [...prev.people, ...newPeople] };
          });
          toast(`Found ${result.people.length} people in the document — ${result.people.length - 1} additional added to the graph`, "success");
        }
        if (result.warning) toast(result.warning, "warning");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Resume parse failed", "warning");
      } finally {
        setIngestBusy(false);
      }
    }
    onUpdateGraph(prev => ({
      ...prev,
      people: prev.people.map(p => p.id === editPerson.id ? nextPerson : p),
    }));
    toast("Person updated", "success");
    setEditPerson(null);
    setResumeFiles([]);
    setDetailPerson(nextPerson);
  }

  const filterItem = (name: string, id: string) =>
    !searchQ || name.toLowerCase().includes(searchQ.toLowerCase()) || id.toLowerCase().includes(searchQ.toLowerCase());

  const partnerOpenActions = detailPartner
    ? Object.values(allPursuits).flatMap(pursuit =>
        (pursuit.responseActionItems ?? [])
          .filter(item => item.assignedPartnerId === detailPartner.id && item.status === "Open")
          .map(item => ({ pursuit, item }))
      )
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="oe-page-title">Capability Sources</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The Capability & Experience Graph — the single source of truth for what the consortium can deliver (I1, CEG-04).
        </p>
      </div>

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

      {tab === "capabilities" && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="oe-table-header">
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">ID</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Capability</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Partners</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Updated</th>
                </tr>
              </thead>
              <tbody>
                {capabilities.filter(c => (showArchived || c.status !== "Archived") && filterItem(c.name, c.id)).map(c => (
                  <tr key={c.id} className="oe-table-row border-b border-border last:border-b-0 cursor-pointer" onClick={() => setDetailCap(c)}>
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{c.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.partners.map(id => partnerName2(id)).join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.updated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "experience" && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="oe-table-header">
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">ID</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Experience</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Industry</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Partners</th>
                </tr>
              </thead>
              <tbody>
                {experience.filter(e => (showArchived || e.status !== "Archived") && filterItem(e.name, e.id)).map(e => (
                  <tr key={e.id} className="oe-table-row border-b border-border last:border-b-0 cursor-pointer" onClick={() => setDetailExp(e)}>
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{e.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{e.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{e.industry || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.partners.map(id => partnerName2(id)).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                </tr>
              </thead>
              <tbody>
                {people.filter(p => (showArchived || p.status !== "Archived") && filterItem(p.name, p.id)).map(p => (
                  <tr key={p.id} className="oe-table-row border-b border-border last:border-b-0 cursor-pointer" onClick={() => setDetailPerson(p)}>
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{p.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{partnerName2(p.partner)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{(p.roles ?? [p.role]).filter(Boolean).join(", ") || p.role}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[400px] truncate hidden xl:table-cell">{p.expertise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "partners" && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="oe-table-header">
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Partner</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Type</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Contact</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Email</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Teaming Agreement</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Status</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {partners.filter(p => (showArchived || p.status !== "Archived") && filterItem(p.name, p.id)).map(p => (
                  <tr key={p.id} className="oe-table-row border-b border-border last:border-b-0 cursor-pointer" onClick={() => setDetailPartnerId(p.id)}>
                    <td className="px-4 py-3 font-semibold text-foreground">{p.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.type}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.contact || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.contactEmail || "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {p.teamingAgreementSigned === true ? (
                        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-go">Signed</span>
                      ) : p.teamingAgreementSigned === false ? (
                        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-cond">Pending</span>
                      ) : <span className="text-muted-foreground">N/A</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
                        p.status === "Active" ? "oe-status-go" : p.status === "Archived" ? "oe-status-closed" : "oe-status-pending"
                      )}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5">
                        <button onClick={() => openEditPartner(p)} className="text-[10px] font-medium px-2 py-1 rounded border border-input bg-card text-foreground cursor-pointer hover:bg-secondary">Edit</button>
                        {p.status === "Archived" ? (
                          <button onClick={() => handleReinstatePartner(p.id)} className="text-[10px] font-medium px-2 py-1 rounded border border-input bg-card text-foreground cursor-pointer hover:bg-secondary">Reinstate</button>
                        ) : (
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

      <Modal open={detailPartner !== null} onClose={() => setDetailPartnerId(null)} title={detailPartner?.name ?? "Partner Details"} wide>
        {detailPartner && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-muted-foreground">Type:</span> <strong>{detailPartner.type}</strong></div>
              <div><span className="text-muted-foreground">Status:</span> <strong>{detailPartner.status}</strong></div>
              <div><span className="text-muted-foreground">Teaming agreement:</span> <strong>{detailPartner.teamingAgreementSigned === true ? "Signed" : detailPartner.teamingAgreementSigned === false ? "Pending" : "N/A"}</strong></div>
              <div><span className="text-muted-foreground">Website:</span> {detailPartner.website !== "—" ? <a href={detailPartner.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{detailPartner.website}</a> : "—"}</div>
              <div><span className="text-muted-foreground">Date added:</span> {detailPartner.createdAt || "—"}</div>
              <div><span className="text-muted-foreground">Contact:</span> {detailPartner.contact}</div>
              <div><span className="text-muted-foreground">Email:</span> {detailPartner.contactEmail || "—"}</div>
            </div>
            {(detailPartner.summary || detailPartner.note) && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Summary</h4>
                <p className="text-xs text-muted-foreground">{detailPartner.summary || detailPartner.note}</p>
              </div>
            )}
            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold mb-2">Open Action Items</h4>
              {partnerOpenActions.length === 0 && <div className="text-xs text-muted-foreground italic">None</div>}
              <div className="space-y-1">
                {partnerOpenActions.map(({ pursuit, item }) => (
                  <button
                    key={`${pursuit.id}-${item.id}`}
                    onClick={() => setActionTarget({ pursuitId: pursuit.id, item })}
                    className="block w-full text-left text-xs text-foreground hover:bg-muted/40 rounded-md px-2 py-1.5"
                  >
                    <span className="font-semibold">{item.description}</span>
                    <span className="text-muted-foreground"> — {pursuit.name} · due {item.dueAt}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold mb-2">Capabilities</h4>
              <div className="space-y-1">{capabilities.filter(c => c.partners.includes(detailPartner.id)).map(c => (
                <div key={c.id} className="text-xs text-foreground">{c.id} — {c.name}</div>
              ))}</div>
            </div>
            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold mb-2">Experience</h4>
              <div className="space-y-1">{experience.filter(e => e.partners.includes(detailPartner.id)).map(e => (
                <div key={e.id} className="text-xs text-foreground">{e.id} — {e.name}</div>
              ))}</div>
            </div>
            <div className="flex justify-end pt-3 border-t border-border">
              <SecondaryButton onClick={() => setDetailPartnerId(null)}>Close</SecondaryButton>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={liveCap !== null} onClose={() => setDetailCap(null)} title={liveCap?.name ?? "Capability"}>
        {liveCap && (
          <div className="space-y-3 text-xs">
            <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{liveCap.id}</span></div>
            <div><span className="text-muted-foreground">Partners:</span> {liveCap.partners.map(id => partnerName2(id)).join(", ") || "—"}</div>
            <div className="flex justify-between pt-2">
              <button onClick={() => { handleDeleteItem("capability", liveCap.id); setDetailCap(null); }} className="text-xs text-destructive cursor-pointer hover:underline">Delete</button>
              <div className="flex gap-2">
                <SecondaryButton onClick={() => { setEditCap(liveCap); setEditCapPartners([...liveCap.partners]); }}>Edit</SecondaryButton>
                <SecondaryButton onClick={() => setDetailCap(null)}>Close</SecondaryButton>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={liveExp !== null} onClose={() => setDetailExp(null)} title={liveExp?.name ?? "Experience"} wide>
        {liveExp && (
          <div className="space-y-3 text-xs">
            <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{liveExp.id}</span></div>
            <div><span className="text-muted-foreground">Industry:</span> {liveExp.industry || "—"}</div>
            <div><span className="text-muted-foreground">Partners:</span> {liveExp.partners.map(id => partnerName2(id)).join(", ") || "—"}</div>
            <div><span className="text-muted-foreground">Technologies:</span> {(liveExp.technologies ?? []).join(", ") || "—"}</div>
            <div><span className="text-muted-foreground">Services:</span> {(liveExp.services ?? []).join(", ") || "—"}</div>
            <div>
              <div className="text-muted-foreground mb-1">Summary</div>
              <p className="text-foreground whitespace-pre-wrap">{liveExp.summary || "—"}</p>
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => { handleDeleteItem("experience", liveExp.id); setDetailExp(null); }} className="text-xs text-destructive cursor-pointer hover:underline">Delete</button>
              <div className="flex gap-2">
                <SecondaryButton onClick={() => {
                  setEditExp(liveExp);
                  setEditExpPartners([...liveExp.partners]);
                  setEditExpIndustry(liveExp.industry ?? "");
                  setEditExpTech((liveExp.technologies ?? []).join(", "));
                  setEditExpServices((liveExp.services ?? []).join(", "));
                  setEditExpSummary(liveExp.summary ?? "");
                }}>Edit</SecondaryButton>
                <SecondaryButton onClick={() => setDetailExp(null)}>Close</SecondaryButton>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={liveCred !== null} onClose={() => setDetailCred(null)} title={liveCred?.name ?? "Credential"} wide>
        {liveCred && (
          <div className="space-y-3 text-xs">
            <div><span className="text-muted-foreground">Type:</span> {liveCred.credType}</div>
            <div><span className="text-muted-foreground">Partner:</span> {partnerName2(liveCred.partner)}</div>
            <div><span className="text-muted-foreground">Expiration:</span> {liveCred.expiration}</div>
            <div>
              <div className="font-semibold mb-1">Document</div>
              <div className="text-muted-foreground mb-1">{liveCred.documentFileName || "No file name on record"}</div>
              <p className="whitespace-pre-wrap bg-muted/40 rounded-md p-3">{liveCred.documentText || "No document text on file."}</p>
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => { handleDeleteItem("credential", liveCred.id); setDetailCred(null); }} className="text-xs text-destructive cursor-pointer hover:underline">Delete</button>
              <SecondaryButton onClick={() => setDetailCred(null)}>Close</SecondaryButton>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={livePerson !== null} onClose={() => setDetailPerson(null)} title={livePerson?.name ?? "Person"} wide>
        {livePerson && (
          <div className="space-y-3 text-xs">
            <div><span className="text-muted-foreground">Partner:</span> {partnerName2(livePerson.partner)}</div>
            <div><span className="text-muted-foreground">Roles:</span> {(livePerson.roles ?? [livePerson.role]).filter(Boolean).join(", ") || "—"}</div>
            <div><span className="text-muted-foreground">Expertise:</span> {livePerson.expertise || "—"}</div>
            <div><span className="text-muted-foreground">Technologies:</span> {(livePerson.technologies ?? []).join(", ") || "—"}</div>
            <div><span className="text-muted-foreground">Industries:</span> {(livePerson.industries ?? []).join(", ") || "—"}</div>
            <div>
              <div className="font-semibold mb-1">Resume {livePerson.resumeFileName ? `(${livePerson.resumeFileName})` : ""}</div>
              <p className="whitespace-pre-wrap bg-muted/40 rounded-md p-3">{livePerson.resumeText || "No resume on file."}</p>
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => { handleDeleteItem("person", livePerson.id); setDetailPerson(null); }} className="text-xs text-destructive cursor-pointer hover:underline">Delete</button>
              <div className="flex gap-2">
                <SecondaryButton onClick={() => {
                  setEditPerson(livePerson);
                  setEditPersonRoles((livePerson.roles ?? [livePerson.role]).filter(Boolean).join(", "));
                  setEditPersonExpertise(livePerson.expertise);
                  setEditPersonIndustries((livePerson.industries ?? []).join(", "));
                  setResumeFiles([]);
                }}>Edit</SecondaryButton>
                <SecondaryButton onClick={() => setDetailPerson(null)}>Close</SecondaryButton>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={editCap !== null} onClose={() => setEditCap(null)} title="Edit Capability">
        <div className="space-y-4">
          <FormField label="Partners">
            <PartnerMultiSelect selected={editCapPartners} options={partnerOptions} onChange={setEditCapPartners} />
          </FormField>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setEditCap(null)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSaveCapability}>Save</PrimaryButton>
          </div>
        </div>
      </Modal>

      <Modal open={editExp !== null} onClose={() => setEditExp(null)} title="Edit Experience" wide>
        <div className="space-y-4">
          <FormField label="Industry">
            <TextInput value={editExpIndustry} onChange={setEditExpIndustry} placeholder="e.g. Government — Labor" />
          </FormField>
          <FormField label="Partners">
            <PartnerMultiSelect selected={editExpPartners} options={partnerOptions} onChange={setEditExpPartners} />
          </FormField>
          <FormField label="Technologies (comma-separated)">
            <TextInput value={editExpTech} onChange={setEditExpTech} />
          </FormField>
          <FormField label="Services (comma-separated)">
            <TextInput value={editExpServices} onChange={setEditExpServices} placeholder="e.g. Program Management, Testing" />
          </FormField>
          <FormField label="Summary">
            <TextArea value={editExpSummary} onChange={setEditExpSummary} rows={5} />
          </FormField>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setEditExp(null)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSaveExperience}>Save</PrimaryButton>
          </div>
        </div>
      </Modal>

      <Modal open={editPerson !== null} onClose={() => setEditPerson(null)} title="Edit Person" wide>
        <div className="space-y-4">
          <FormField label="Roles (comma-separated)">
            <TextInput value={editPersonRoles} onChange={setEditPersonRoles} />
          </FormField>
          <FormField label="Expertise">
            <TextArea value={editPersonExpertise} onChange={setEditPersonExpertise} rows={3} />
          </FormField>
          <FormField label="Industries (comma-separated)">
            <TextInput value={editPersonIndustries} onChange={setEditPersonIndustries} />
          </FormField>
          <FormField label="Replace resume" hint="A new resume re-sets roles, expertise, and industries from the parsed document.">
            <DocumentDropzone files={resumeFiles} onChange={setResumeFiles} disabled={ingestBusy} dropLabel="Drop your Resumes here" />
          </FormField>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setEditPerson(null)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSavePerson} disabled={ingestBusy}>{ingestBusy ? "Parsing…" : "Save"}</PrimaryButton>
          </div>
        </div>
      </Modal>

      <Modal open={editPartner !== null} onClose={() => setEditPartner(null)} title="Edit Partner" wide>
        <div className="space-y-4">
          <FormField label="Partner name">
            <TextInput value={editPartnerName} onChange={setEditPartnerName} />
          </FormField>
          <FormField label="Type">
            <SelectInput value={editPartnerType} onChange={setEditPartnerType} options={PARTNER_TYPES} />
          </FormField>
          <FormField label="Contact name">
            <TextInput value={editPartnerContact} onChange={setEditPartnerContact} />
          </FormField>
          <FormField label="Contact email">
            <TextInput value={editPartnerEmail} onChange={setEditPartnerEmail} type="email" />
          </FormField>
          <FormField label="Website">
            <TextInput value={editPartnerWebsite} onChange={setEditPartnerWebsite} />
          </FormField>
          <FormField label="Summary">
            <TextArea value={editPartnerSummary} onChange={setEditPartnerSummary} rows={3} />
          </FormField>
          <FormField label="Teaming agreement">
            <TeamingToggle value={editPartnerTeaming} onChange={setEditPartnerTeaming} />
          </FormField>
          <FormField label="Capability documents">
            <DocumentDropzone files={editCapFiles} onChange={setEditCapFiles} disabled={ingestBusy} dropLabel="Drop the Capability Statements here" />
          </FormField>
          <FormField label="Experience documents">
            <DocumentDropzone files={editExpFiles} onChange={setEditExpFiles} disabled={ingestBusy} dropLabel="Drop the Experience/Project Summaries here" />
          </FormField>
          <FormField label="Credential documents">
            <DocumentDropzone files={editCredFiles} onChange={setEditCredFiles} disabled={ingestBusy} dropLabel="Drop your Certification, Insurance, Bonding, and Other Credential documents here" />
          </FormField>
          <FormField label="People / resume documents">
            <DocumentDropzone files={editPeopleFiles} onChange={setEditPeopleFiles} disabled={ingestBusy} dropLabel="Drop your Resumes here" />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setEditPartner(null)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSavePartner} disabled={!editPartnerName.trim() || ingestBusy}>{ingestBusy ? "Saving…" : "Save"}</PrimaryButton>
          </div>
        </div>
      </Modal>

      <Modal open={addCapOpen} onClose={() => setAddCapOpen(false)} title="Add Capability">
        <div className="space-y-4">
          <FormField label="Capability name">
            <TextInput value={capName} onChange={setCapName} placeholder="e.g. Cloud Infrastructure Security" />
          </FormField>
          <FormField label="Partners">
            <PartnerMultiSelect selected={capPartners} options={partnerOptions} onChange={setCapPartners} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setAddCapOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleAddCapability} disabled={!capName.trim()}>Add Capability</PrimaryButton>
          </div>
        </div>
      </Modal>

      <Modal open={addExpOpen} onClose={() => setAddExpOpen(false)} title="Add Experience" wide>
        <div className="space-y-4">
          <FormField label="Experience / project name">
            <TextInput value={expName} onChange={setExpName} placeholder="e.g. State of Oregon — Benefits Platform Migration" />
          </FormField>
          <FormField label="Industry">
            <TextInput value={expIndustry} onChange={setExpIndustry} placeholder="e.g. Government — Labor" />
          </FormField>
          <FormField label="Partners">
            <PartnerMultiSelect selected={expPartners} options={partnerOptions} onChange={setExpPartners} />
          </FormField>
          <FormField label="Technologies (comma-separated)">
            <TextInput value={expTech} onChange={setExpTech} placeholder="e.g. AWS GovCloud, PostgreSQL" />
          </FormField>
          <FormField label="Services (comma-separated)">
            <TextInput value={expServices} onChange={setExpServices} placeholder="e.g. Program Management, Testing" />
          </FormField>
          <FormField label="Summary">
            <TextArea value={expSummary} onChange={setExpSummary} rows={4} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setAddExpOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleAddExperience} disabled={!expName.trim()}>Add Experience</PrimaryButton>
          </div>
        </div>
      </Modal>

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

      <Modal open={addPersonOpen} onClose={() => setAddPersonOpen(false)} title="Add Person">
        <div className="space-y-4">
          <FormField label="Full name">
            <TextInput value={personName} onChange={setPersonName} placeholder="e.g. Sarah Chen, PMP" />
          </FormField>
          <FormField label="Roles (comma-separated)">
            <TextInput value={personRole} onChange={setPersonRole} placeholder="e.g. Senior Solutions Architect" />
          </FormField>
          <FormField label="Partner organization">
            <SelectInput value={personPartner} onChange={setPersonPartner} options={[{ value: "", label: "Select partner…" }, ...partnerOptions]} />
          </FormField>
          <FormField label="Expertise summary">
            <TextInput value={personExpertise} onChange={setPersonExpertise} placeholder="e.g. 10 years cloud migration experience…" />
          </FormField>
          <FormField label="Industries (comma-separated)">
            <TextInput value={personIndustries} onChange={setPersonIndustries} placeholder="e.g. Government, Healthcare" />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setAddPersonOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleAddPerson} disabled={!personName.trim()}>Add Person</PrimaryButton>
          </div>
        </div>
      </Modal>

      <Modal open={addPartnerOpen} onClose={() => setAddPartnerOpen(false)} title="Add Partner" wide>
        <div className="space-y-4">
          <FormField label="Partner name">
            <TextInput value={partnerName} onChange={setPartnerName} placeholder="e.g. Apex Federal Solutions" />
          </FormField>
          <FormField label="Type">
            <SelectInput value={partnerType} onChange={setPartnerType} options={PARTNER_TYPES} />
          </FormField>
          <FormField label="Contact name">
            <TextInput value={partnerContact} onChange={setPartnerContact} placeholder="e.g. Jordan Hale" />
          </FormField>
          <FormField label="Contact email">
            <TextInput value={partnerEmail} onChange={setPartnerEmail} type="email" placeholder="e.g. jhale@apexfederal.com" />
          </FormField>
          <FormField label="Website (optional)">
            <TextInput value={partnerWebsite} onChange={setPartnerWebsite} placeholder="e.g. https://example.com" />
          </FormField>
          <FormField label="Summary (optional)">
            <TextArea value={partnerSummary} onChange={setPartnerSummary} rows={3} />
          </FormField>
          <FormField label="Source link (optional)">
            <TextInput value={partnerSourceLink} onChange={setPartnerSourceLink} />
          </FormField>
          <FormField label="Teaming agreement">
            <TeamingToggle value={partnerTeaming} onChange={setPartnerTeaming} />
          </FormField>
          <FormField label="Capability documents">
            <DocumentDropzone files={capFiles} onChange={setCapFiles} disabled={ingestBusy} dropLabel="Drop the Capability Statements here" />
          </FormField>
          <FormField label="Experience documents">
            <DocumentDropzone files={expFiles} onChange={setExpFiles} disabled={ingestBusy} dropLabel="Drop the Experience/Project Summaries here" />
          </FormField>
          <FormField label="Credential documents">
            <DocumentDropzone files={credFiles} onChange={setCredFiles} disabled={ingestBusy} dropLabel="Drop your Certification, Insurance, Bonding, and Other Credential documents here" />
          </FormField>
          <FormField label="People / resume documents">
            <DocumentDropzone files={peopleFiles} onChange={setPeopleFiles} disabled={ingestBusy} dropLabel="Drop your Resumes here" />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setAddPartnerOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleAddPartner} disabled={!partnerName.trim() || ingestBusy}>{ingestBusy ? "Ingesting…" : "Add Partner"}</PrimaryButton>
          </div>
        </div>
      </Modal>

      <ActionItemResponseModal
        open={actionTarget !== null}
        item={actionTarget?.item ?? null}
        pursuitName={actionTarget ? allPursuits[actionTarget.pursuitId]?.name : undefined}
        assigneeLabel={detailPartner?.name}
        onClose={() => setActionTarget(null)}
        onSave={updates => {
          if (!actionTarget) return;
          const pursuit = allPursuits[actionTarget.pursuitId];
          if (!pursuit) return;
          onUpdatePursuit(pursuit.id, {
            responseActionItems: (pursuit.responseActionItems ?? []).map(item =>
              item.id === actionTarget.item.id ? { ...item, ...updates } : item
            ),
          });
          toast("Action item updated", "success");
        }}
      />
    </div>
  );
}
