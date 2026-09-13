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
import { Modal, FormField, TextInput, SelectInput, PrimaryButton, SecondaryButton } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

type TabId = "capabilities" | "experience" | "credentials" | "people" | "partners";

export function SourcesView() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>("capabilities");
  const [searchQ, setSearchQ] = useState("");

  const [capabilities, setCapabilities] = useState<GraphCapability[]>(initialGraph.capabilities);
  const [experience, setExperience] = useState<GraphExperience[]>(initialGraph.experience);
  const [credentials, setCredentials] = useState<GraphCredential[]>(initialGraph.credentials);
  const [people, setPeople] = useState<GraphPerson[]>(initialGraph.people);
  const [partners, setPartners] = useState<Partner[]>(initialPartners);

  const [addCapOpen, setAddCapOpen] = useState(false);
  const [capName, setCapName] = useState("");
  const [capPartner, setCapPartner] = useState("");

  const [addExpOpen, setAddExpOpen] = useState(false);
  const [expName, setExpName] = useState("");
  const [expTech, setExpTech] = useState("");

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
  const [partnerType, setPartnerType] = useState("Teaming partner — Qualified Bench");
  const [partnerWebsite, setPartnerWebsite] = useState("");

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "capabilities", label: "Capabilities", count: capabilities.length },
    { id: "experience", label: "Experience", count: experience.length },
    { id: "credentials", label: "Credentials", count: credentials.length },
    { id: "people", label: "People", count: people.length },
    { id: "partners", label: "Partners", count: partners.length },
  ];

  function handleAddCapability() {
    if (!capName.trim()) return;
    const id = `CAP-${String(capabilities.length + 300).padStart(4, "0")}`;
    setCapabilities(prev => [...prev, {
      id, name: capName.trim(), partners: capPartner ? [capPartner] : [], status: "Pending", updated: new Date().toISOString().slice(0, 10),
    }]);
    toast(`Capability "${capName.trim()}" added`, "success");
    setAddCapOpen(false);
    setCapName("");
    setCapPartner("");
  }

  function handleAddExperience() {
    if (!expName.trim()) return;
    const id = `EXP-${String(experience.length + 600).padStart(4, "0")}`;
    setExperience(prev => [...prev, {
      id, name: expName.trim(), partners: [], capabilities: [], technologies: expTech.split(",").map(s => s.trim()).filter(Boolean), status: "Pending re-validation", updated: new Date().toISOString().slice(0, 10),
    }]);
    toast(`Experience "${expName.trim()}" added`, "success");
    setAddExpOpen(false);
    setExpName("");
    setExpTech("");
  }

  function handleAddCredential() {
    if (!credName.trim()) return;
    const id = `CRED-${String(credentials.length + 40).padStart(3, "0")}`;
    setCredentials(prev => [...prev, {
      id, name: credName.trim(), credType, partner: credPartner || "PTR-U", scope: "", expiration: credExpiration || "TBD", status: "Pending", updated: new Date().toISOString().slice(0, 10),
    }]);
    toast(`Credential "${credName.trim()}" added`, "success");
    setAddCredOpen(false);
    setCredName("");
    setCredExpiration("");
  }

  function handleAddPerson() {
    if (!personName.trim()) return;
    const id = `PPL-${String(people.length + 130)}`;
    setPeople(prev => [...prev, {
      id, name: personName.trim(), partner: personPartner || "PTR-U", role: personRole, skills: [], technologies: [], expertise: personExpertise, projectHistory: [], status: "Pending", updated: new Date().toISOString().slice(0, 10),
    }]);
    toast(`"${personName.trim()}" added to people registry`, "success");
    setAddPersonOpen(false);
    setPersonName("");
    setPersonRole("");
    setPersonExpertise("");
  }

  function handleAddPartner() {
    if (!partnerName.trim()) return;
    const id = `PTR-${partnerName.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 4)}`;
    setPartners(prev => [...prev, {
      id, name: partnerName.trim(), type: partnerType, website: partnerWebsite, repo: "—", contact: "—", status: "Active", teamingAgreementSigned: false, accessTier: null, covers: [], note: "",
    }]);
    toast(`Partner "${partnerName.trim()}" added`, "success");
    setAddPartnerOpen(false);
    setPartnerName("");
    setPartnerWebsite("");
  }

  const partnerOptions = partners.map(p => ({ value: p.id, label: p.name }));

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
        <div className="bg-muted/60 inline-flex p-1 rounded-xl gap-0.5 overflow-x-auto oe-touch-scroll oe-touch-scroll max-w-full">
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

        <div className="flex items-center gap-2 w-full lg:w-auto">
          <input
            type="text"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder={`Search ${tab}…`}
            className="oe-field text-[11px] flex-1 lg:w-48 lg:flex-none"
          />
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
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Owners</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Status</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Updated</th>
                </tr>
              </thead>
              <tbody>
                {capabilities.filter(c => !searchQ || c.name.toLowerCase().includes(searchQ.toLowerCase()) || c.id.toLowerCase().includes(searchQ.toLowerCase())).map(c => (
                  <tr key={c.id} className="oe-table-row border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{c.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.partners.map(id => getPartner(id)?.name ?? id).join(", ")}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
                        c.status === "Verified" ? "oe-status-go" : "oe-status-cond"
                      )}>
                        {c.status}
                      </span>
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
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Technologies</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Status</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Updated</th>
                </tr>
              </thead>
              <tbody>
                {experience.filter(e => !searchQ || e.name.toLowerCase().includes(searchQ.toLowerCase()) || e.id.toLowerCase().includes(searchQ.toLowerCase())).map(e => (
                  <tr key={e.id} className="oe-table-row border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{e.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{e.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{e.technologies.join(", ")}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
                        e.status === "Verified" ? "oe-status-go" : "oe-status-cond"
                      )}>
                        {e.status}
                      </span>
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
                {credentials.filter(c => !searchQ || c.name.toLowerCase().includes(searchQ.toLowerCase()) || c.id.toLowerCase().includes(searchQ.toLowerCase())).map(c => (
                  <tr key={c.id} className="oe-table-row border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{c.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.credType}</td>
                    <td className="px-4 py-3 text-muted-foreground">{getPartner(c.partner)?.name ?? c.partner}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.expiration}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
                        c.status === "Verified" ? "oe-status-go" :
                        c.status.includes("Partner") ? "oe-status-trace" :
                        "oe-status-cond"
                      )}>
                        {c.status}
                      </span>
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
                {people.filter(p => !searchQ || p.name.toLowerCase().includes(searchQ.toLowerCase()) || p.id.toLowerCase().includes(searchQ.toLowerCase())).map(p => (
                  <tr key={p.id} className="oe-table-row border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{p.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{getPartner(p.partner)?.name ?? p.partner}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.role}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[400px] truncate hidden xl:table-cell">{p.expertise}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
                        p.status === "Verified" ? "oe-status-go" : "oe-status-cond"
                      )}>
                        {p.status}
                      </span>
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
                </tr>
              </thead>
              <tbody>
                {partners.filter(p => !searchQ || p.name.toLowerCase().includes(searchQ.toLowerCase()) || p.id.toLowerCase().includes(searchQ.toLowerCase())).map(p => (
                  <tr key={p.id} className="oe-table-row border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-semibold text-foreground">{p.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.type}</td>
                    <td className="px-4 py-3 text-xs">
                      {p.website && p.website !== "—" ? (
                        <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{p.website}</a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {p.teamingAgreementSigned === true ? (
                        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-go">Signed</span>
                      ) : p.teamingAgreementSigned === false ? (
                        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md oe-status-cond">Pending</span>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.covers.length > 0 ? p.covers.join(", ") : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
                        p.status === "Active" ? "oe-status-go" : "oe-status-pending"
                      )}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Capability Modal */}
      <Modal open={addCapOpen} onClose={() => setAddCapOpen(false)} title="Add Capability">
        <div className="space-y-4">
          <FormField label="Capability name">
            <TextInput value={capName} onChange={setCapName} placeholder="e.g. Cloud Infrastructure Security" />
          </FormField>
          <FormField label="Primary owner (partner)">
            <SelectInput
              value={capPartner}
              onChange={setCapPartner}
              options={[{ value: "", label: "Select partner…" }, ...partnerOptions]}
            />
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
            <SelectInput
              value={credType}
              onChange={setCredType}
              options={[
                { value: "Certification", label: "Certification" },
                { value: "Insurance", label: "Insurance" },
                { value: "Bonding", label: "Bonding" },
                { value: "License", label: "License" },
              ]}
            />
          </FormField>
          <FormField label="Partner">
            <SelectInput
              value={credPartner}
              onChange={setCredPartner}
              options={[{ value: "", label: "Select partner…" }, ...partnerOptions]}
            />
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
            <SelectInput
              value={personPartner}
              onChange={setPersonPartner}
              options={[{ value: "", label: "Select partner…" }, ...partnerOptions]}
            />
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
      <Modal open={addPartnerOpen} onClose={() => setAddPartnerOpen(false)} title="Add Partner">
        <div className="space-y-4">
          <FormField label="Partner name">
            <TextInput value={partnerName} onChange={setPartnerName} placeholder="e.g. Apex Federal Solutions" />
          </FormField>
          <FormField label="Type">
            <SelectInput
              value={partnerType}
              onChange={setPartnerType}
              options={[
                { value: "Consortium member", label: "Consortium member" },
                { value: "Teaming partner — Strategic", label: "Teaming partner — Strategic" },
                { value: "Teaming partner — Qualified Bench", label: "Teaming partner — Qualified Bench" },
                { value: "Teaming partner — Situational", label: "Teaming partner — Situational" },
              ]}
            />
          </FormField>
          <FormField label="Website (optional)">
            <TextInput value={partnerWebsite} onChange={setPartnerWebsite} placeholder="e.g. https://example.com" />
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
