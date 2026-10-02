"use client";

import { useEffect, useState } from "react";
import { type Play, type PlayProposalInput } from "@opportunity-engine/core";
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
import { DateField, normalizeDateEntry } from "@/components/ui/date-field";
import { DocumentDropzone } from "@/components/pursuit/document-dropzone";
import { ActionItemResponseModal } from "@/components/action-items/action-item-response-modal";
import { useToast } from "@/components/ui/toast";
import { useOperator } from "@/components/auth/operator-provider";
import { cn } from "@/lib/cn";
import {
  applyPartnerIngest,
  applyResumeReplacement,
  ingestPartnerDocuments,
  ingestPartnerDetailsFile,
  type ParsedCorporateInfo,
  type PartnerIngestKind,
  type PartnerIngestResult,
} from "@/lib/partner-ingest";

type TabId = "partners" | "capabilities" | "experience" | "credentials" | "people" | "plays";

const PARTNER_TYPES = [
  { value: "Prime", label: "Prime" },
  { value: "JV", label: "JV (Joint Venture)" },
  { value: "Subcontractor", label: "Subcontractor" },
];

const CREDENTIAL_TYPES = [
  { value: "Certification", label: "Certification" },
  { value: "Insurance", label: "Insurance" },
  { value: "Bonding", label: "Bonding" },
  { value: "License", label: "License" },
];

function credentialTypeOptions(current: string) {
  if (current && !CREDENTIAL_TYPES.some(option => option.value === current)) {
    return [{ value: current, label: current }, ...CREDENTIAL_TYPES];
  }
  return CREDENTIAL_TYPES;
}

const TEAMING_OPTIONS: { value: "na" | "pending" | "signed"; label: string; flag: boolean | null }[] = [
  { value: "na", label: "N/A", flag: null },
  { value: "pending", label: "Pending", flag: false },
  { value: "signed", label: "Signed", flag: true },
];

const TEAMING_FILTER_OPTIONS = TEAMING_OPTIONS.map(({ value, label }) => ({ value, label }));

const PARTNER_STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "Pending", label: "Pending" },
  { value: "Archived", label: "Archived" },
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

type SortDir = "asc" | "desc";

function cmp(a: string, b: string, dir: SortDir): number {
  const r = a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  return dir === "asc" ? r : -r;
}

function cmpTeaming(a: boolean | null, b: boolean | null, dir: SortDir): number {
  const rank = (v: boolean | null) => (v === true ? 0 : v === false ? 1 : 2);
  const r = rank(a) - rank(b);
  return dir === "asc" ? r : -r;
}

function toggleSort<T extends string>(
  current: { field: T; dir: SortDir },
  field: T,
): { field: T; dir: SortDir } {
  if (current.field === field) return { field, dir: current.dir === "asc" ? "desc" : "asc" };
  return { field, dir: "asc" };
}

function SortableHeader({
  label,
  field,
  current,
  className,
  onClick,
}: {
  label: string;
  field: string;
  current: { field: string; dir: SortDir };
  className?: string;
  onClick: () => void;
}) {
  const active = current.field === field;
  return (
    <th
      className={cn(
        "text-left text-[10px] uppercase tracking-wider font-semibold px-4 py-2.5 cursor-pointer select-none transition-colors whitespace-nowrap",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1.5">
        {label}
        <svg width="16" height="16" viewBox="0 0 10 10" className="inline-block shrink-0" aria-hidden="true">
          <path d="M5 0.6l3.4 3.8H1.6z" fill="currentColor" opacity={active && current.dir === "asc" ? 1 : 0.45} />
          <path d="M5 9.4l3.4-3.8H1.6z" fill="currentColor" opacity={active && current.dir === "desc" ? 1 : 0.45} />
        </svg>
      </span>
    </th>
  );
}

function textMatch(value: string, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  if (!q) return true;
  return value.toLowerCase().includes(q);
}

function exactMatch(value: string, filter: string): boolean {
  if (!filter) return true;
  return value === filter;
}

function partnersMatch(ids: string[], filter: string): boolean {
  if (!filter) return true;
  return ids.includes(filter);
}

function filtersActive(filters: Record<string, string>): boolean {
  return Object.values(filters).some(value => value.trim());
}

function ColumnFilter({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options?: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <th className={cn("px-3 py-2 align-middle font-normal", className)}>
      {options ? (
        <select
          aria-label={`Filter ${label}`}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="oe-select text-[11px] py-1.5 w-full min-w-[6.5rem]"
        >
          <option value="">All</option>
          {options.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : (
        <input
          aria-label={`Filter ${label}`}
          type="search"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Filter"
          className="oe-field text-[11px] py-1.5 w-full min-w-[5.5rem]"
        />
      )}
    </th>
  );
}

function EmptyFilterRow({
  colSpan,
  noun,
  filtered,
}: {
  colSpan: number;
  noun: string;
  filtered: boolean;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-xs text-muted-foreground">
        {filtered ? `No matching ${noun}.` : `No ${noun} yet.`}
      </td>
    </tr>
  );
}

const CAPABILITY_PAGE_SIZES = [20, 25, 30, 40, 50] as const;

function pageWindow(page: number, pageCount: number): Array<number | "ellipsis"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const anchors = [1, pageCount, page - 1, page, page + 1].filter(value => value >= 1 && value <= pageCount);
  const sorted = [...new Set(anchors)].sort((a, b) => a - b);
  const window: Array<number | "ellipsis"> = [];
  let previous: number | null = null;
  for (const value of sorted) {
    if (previous !== null && value - previous > 1) window.push("ellipsis");
    window.push(value);
    previous = value;
  }
  return window;
}

function CapabilityPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);
  const pages = pageWindow(safePage, pageCount);

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground tabular-nums">{start}–{end}</span> of{" "}
        <span className="font-medium text-foreground tabular-nums">{total}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="whitespace-nowrap">Rows per page</span>
          <span className="relative">
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={event => onPageSizeChange(Number(event.target.value))}
              className="oe-select text-[11px] py-1.5 w-[5.5rem]"
            >
              {CAPABILITY_PAGE_SIZES.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </label>
        <nav aria-label="Capabilities pages" className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
            className="px-2.5 py-1.5 text-[11px] font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            Previous
          </button>
          {pages.map((entry, index) => entry === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="px-1 text-[11px] text-muted-foreground" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onPageChange(entry)}
              aria-current={entry === safePage ? "page" : undefined}
              className={cn(
                "min-w-7 px-2 py-1.5 text-[11px] font-medium rounded-md cursor-pointer tabular-nums",
                entry === safePage
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {entry}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= pageCount || total === 0}
            className="px-2.5 py-1.5 text-[11px] font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            Next
          </button>
        </nav>
      </div>
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

function FileUploadInfo({ fileName, uploadedAt }: { fileName?: string; uploadedAt?: string }) {
  if (!fileName) return null;
  return (
    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-1.5 px-0.5">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary shrink-0">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span className="truncate font-medium">{fileName}</span>
      {uploadedAt && <span className="shrink-0 text-muted-foreground/70">· uploaded {uploadedAt}</span>}
    </div>
  );
}

export function SourcesView({
  partners,
  graph,
  allPursuits,
  plays,
  onUpdatePartners,
  onUpdateGraph,
  onUpdatePursuit,
  onProposePlay,
  onApprovePlay,
  onArchivePartner,
  onReinstatePartner,
}: {
  partners: Partner[];
  graph: GraphData;
  allPursuits: Record<string, Pursuit>;
  plays: Play[];
  onUpdatePartners: (next: Partner[] | ((prev: Partner[]) => Partner[])) => void;
  onUpdateGraph: (next: GraphData | ((prev: GraphData) => GraphData)) => void;
  onUpdatePursuit: (pursuitId: string, updates: Partial<Pursuit>) => void;
  onProposePlay: (input: PlayProposalInput) => void;
  onApprovePlay: (playId: string, approvedBy: string) => void;
  onArchivePartner?: (partnerId: string) => void;
  onReinstatePartner?: (partnerId: string) => void;
}) {
  const { toast } = useToast();
  const { profile } = useOperator();
  const [tab, setTab] = useState<TabId>("partners");
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
  const [partnerYearFounded, setPartnerYearFounded] = useState("");
  const [partnerHqAddress, setPartnerHqAddress] = useState("");
  const [partnerHqPhone, setPartnerHqPhone] = useState("");
  const [partnerHqEmail, setPartnerHqEmail] = useState("");
  const [partnerPrimaryContact, setPartnerPrimaryContact] = useState("");
  const [partnerHeadcount, setPartnerHeadcount] = useState("");
  const [partnerEin, setPartnerEin] = useState("");
  const [partnerUei, setPartnerUei] = useState("");
  const [partnerDetailsFiles, setPartnerDetailsFiles] = useState<File[]>([]);
  const [detailsProcessing, setDetailsProcessing] = useState(false);
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
  const [editPartnerYearFounded, setEditPartnerYearFounded] = useState("");
  const [editPartnerHqAddress, setEditPartnerHqAddress] = useState("");
  const [editPartnerHqPhone, setEditPartnerHqPhone] = useState("");
  const [editPartnerHqEmail, setEditPartnerHqEmail] = useState("");
  const [editPartnerPrimaryContact, setEditPartnerPrimaryContact] = useState("");
  const [editPartnerHeadcount, setEditPartnerHeadcount] = useState("");
  const [editPartnerEin, setEditPartnerEin] = useState("");
  const [editPartnerUei, setEditPartnerUei] = useState("");
  const [editPartnerDetailsFiles, setEditPartnerDetailsFiles] = useState<File[]>([]);
  const [editDetailsProcessing, setEditDetailsProcessing] = useState(false);
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
  const [editCredType, setEditCredType] = useState("Certification");
  const [editCredExpiration, setEditCredExpiration] = useState("");
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

  const [capPage, setCapPage] = useState(1);
  const [capPageSize, setCapPageSize] = useState<number>(20);
  const [capSort, setCapSort] = useState<{ field: string; dir: SortDir }>({ field: "name", dir: "asc" });
  const [expSort, setExpSort] = useState<{ field: string; dir: SortDir }>({ field: "name", dir: "asc" });
  const [credSort, setCredSort] = useState<{ field: string; dir: SortDir }>({ field: "name", dir: "asc" });
  const [peopleSort, setPeopleSort] = useState<{ field: string; dir: SortDir }>({ field: "name", dir: "asc" });
  const [partnerSort, setPartnerSort] = useState<{ field: string; dir: SortDir }>({ field: "name", dir: "asc" });
  const [playSort, setPlaySort] = useState<{ field: string; dir: SortDir }>({ field: "name", dir: "asc" });
  const [detailPlay, setDetailPlay] = useState<Play | null>(null);
  const [capFilters, setCapFilters] = useState<Record<string, string>>({});
  const [expFilters, setExpFilters] = useState<Record<string, string>>({});
  const [credFilters, setCredFilters] = useState<Record<string, string>>({});
  const [peopleFilters, setPeopleFilters] = useState<Record<string, string>>({});
  const [partnerFilters, setPartnerFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    setCapPage(1);
  }, [searchQ, capFilters, capSort, capPageSize]);

  const [editCred, setEditCred] = useState<GraphCredential | null>(null);
  const [credDocFiles, setCredDocFiles] = useState<File[]>([]);

  const isActive = (status: string) => status !== "Archived";

  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposeName, setProposeName] = useState("");
  const [proposeProblem, setProposeProblem] = useState("");
  const [proposeSector, setProposeSector] = useState("");
  const [proposeOrgType, setProposeOrgType] = useState("");
  const [proposeServices, setProposeServices] = useState("");

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "partners", label: "Partners", count: partners.filter(p => showArchived || isActive(p.status)).length },
    { id: "capabilities", label: "Capabilities", count: capabilities.filter(c => isActive(c.status)).length },
    { id: "experience", label: "Experience", count: experience.filter(e => isActive(e.status)).length },
    { id: "credentials", label: "Credentials", count: credentials.filter(c => isActive(c.status)).length },
    { id: "people", label: "People", count: people.filter(p => isActive(p.status)).length },
    { id: "plays", label: "Plays", count: plays.length },
  ];

  const activePartners = partners.filter(p => p.status !== "Archived");
  const partnerOptions = activePartners.map(p => ({ value: p.id, label: p.name }));
  const credTypeFilterOptions = Array.from(new Set([
    ...CREDENTIAL_TYPES.map(option => option.value),
    ...credentials.map(item => item.credType).filter(Boolean),
  ])).map(value => ({ value, label: value }));
  const partnerTypeFilterOptions = Array.from(new Set([
    ...PARTNER_TYPES.map(option => option.value),
    ...partners.map(item => item.type).filter(Boolean),
  ])).map(value => ({
    value,
    label: PARTNER_TYPES.find(option => option.value === value)?.label ?? value,
  }));
  const columnFilters = tab === "capabilities" ? capFilters
    : tab === "experience" ? expFilters
    : tab === "credentials" ? credFilters
    : tab === "people" ? peopleFilters
    : partnerFilters;
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

  function applyCorporateInfo(
    corp: ParsedCorporateInfo,
    getters: Record<string, string>,
    setters: Record<string, (v: string) => void>,
  ) {
    const map: [string, keyof ParsedCorporateInfo][] = [
      ["name", "name"], ["yearFounded", "yearFounded"], ["hqAddress", "hqAddress"],
      ["hqPhone", "hqPhone"], ["hqEmail", "hqEmail"], ["primaryContact", "primaryContact"],
      ["headcount", "employeeHeadcount"], ["ein", "ein"], ["uei", "uei"],
      ["summary", "summary"], ["website", "website"], ["contact", "primaryContact"],
    ];
    let filled = 0;
    for (const [key, corpKey] of map) {
      const value = corp[corpKey];
      if (value && !(getters[key] ?? "").trim()) {
        setters[key]?.(value);
        filled++;
      }
    }
    return filled;
  }

  async function handlePartnerDetailsUpload(files: File[]) {
    setPartnerDetailsFiles(files);
    if (!files.length) return;
    setDetailsProcessing(true);
    try {
      const result = await ingestPartnerDocuments("corporate", files);
      const corp = result.corporate;
      if (corp) {
        applyCorporateInfo(corp, {
          name: partnerName, yearFounded: partnerYearFounded, hqAddress: partnerHqAddress,
          hqPhone: partnerHqPhone, hqEmail: partnerHqEmail, primaryContact: partnerPrimaryContact,
          headcount: partnerHeadcount, ein: partnerEin, uei: partnerUei,
          summary: partnerSummary, website: partnerWebsite, contact: partnerContact,
        }, {
          name: setPartnerName, yearFounded: setPartnerYearFounded, hqAddress: setPartnerHqAddress,
          hqPhone: setPartnerHqPhone, hqEmail: setPartnerHqEmail, primaryContact: setPartnerPrimaryContact,
          headcount: setPartnerHeadcount, ein: setPartnerEin, uei: setPartnerUei,
          summary: setPartnerSummary, website: setPartnerWebsite, contact: setPartnerContact,
        });
        toast("Corporate info extracted — review and adjust fields as needed", "success");
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not extract corporate info from file", "warning");
    } finally {
      setDetailsProcessing(false);
    }
  }

  async function handleEditPartnerDetailsUpload(files: File[]) {
    setEditPartnerDetailsFiles(files);
    if (!files.length) return;
    setEditDetailsProcessing(true);
    try {
      const result = await ingestPartnerDocuments("corporate", files);
      const corp = result.corporate;
      if (corp) {
        applyCorporateInfo(corp, {
          name: editPartnerName, yearFounded: editPartnerYearFounded, hqAddress: editPartnerHqAddress,
          hqPhone: editPartnerHqPhone, hqEmail: editPartnerHqEmail, primaryContact: editPartnerPrimaryContact,
          headcount: editPartnerHeadcount, ein: editPartnerEin, uei: editPartnerUei,
          summary: editPartnerSummary, website: editPartnerWebsite, contact: editPartnerContact,
        }, {
          name: setEditPartnerName, yearFounded: setEditPartnerYearFounded, hqAddress: setEditPartnerHqAddress,
          hqPhone: setEditPartnerHqPhone, hqEmail: setEditPartnerHqEmail, primaryContact: setEditPartnerPrimaryContact,
          headcount: setEditPartnerHeadcount, ein: setEditPartnerEin, uei: setEditPartnerUei,
          summary: setEditPartnerSummary, website: setEditPartnerWebsite, contact: setEditPartnerContact,
        });
        toast("Corporate info extracted — review and adjust fields as needed", "success");
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not extract corporate info from file", "warning");
    } finally {
      setEditDetailsProcessing(false);
    }
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
        id, name: credName.trim(), credType, partner: credPartner || "PTR-U", scope: "", expiration: normalizeDateEntry(credExpiration).trim() || "TBD",
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
    const stamp = new Date().toISOString().slice(0, 10);
    const id = `PTR-${partnerName.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 4)}${Date.now().toString().slice(-2)}`;
    const detailsFileName = partnerDetailsFiles[0]?.name;
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
      createdAt: stamp,
      yearFounded: partnerYearFounded.trim() || undefined,
      hqAddress: partnerHqAddress.trim() || undefined,
      hqPhone: partnerHqPhone.trim() || undefined,
      hqEmail: partnerHqEmail.trim() || undefined,
      primaryContact: partnerPrimaryContact.trim() || undefined,
      employeeHeadcount: partnerHeadcount.trim() || undefined,
      ein: partnerEin.trim() || undefined,
      uei: partnerUei.trim() || undefined,
      partnerDetailsFileName: detailsFileName,
      partnerDetailsUploadedAt: detailsFileName ? stamp : undefined,
      capabilityUploadFileName: capFiles[0]?.name ?? (detailsFileName ? `(from ${detailsFileName})` : undefined),
      capabilityUploadedAt: (capFiles.length || detailsFileName) ? stamp : undefined,
      experienceUploadFileName: expFiles[0]?.name ?? (detailsFileName ? `(from ${detailsFileName})` : undefined),
      experienceUploadedAt: (expFiles.length || detailsFileName) ? stamp : undefined,
      credentialUploadFileName: credFiles[0]?.name ?? (detailsFileName ? `(from ${detailsFileName})` : undefined),
      credentialUploadedAt: (credFiles.length || detailsFileName) ? stamp : undefined,
      peopleUploadFileName: peopleFiles[0]?.name ?? (detailsFileName ? `(from ${detailsFileName})` : undefined),
      peopleUploadedAt: (peopleFiles.length || detailsFileName) ? stamp : undefined,
    };
    onUpdatePartners(prev => [...prev, created]);
    setIngestBusy(true);
    try {
      const allNotes: string[] = [];
      if (partnerDetailsFiles.length) {
        const detailsResult = await ingestPartnerDetailsFile(partnerDetailsFiles);
        if (detailsResult.warning) toast(detailsResult.warning, "warning");
        onUpdateGraph(prev => {
          let next = prev;
          for (const result of detailsResult.results) {
            const applied = applyPartnerIngest(next, id, result);
            next = applied.graph;
            if (applied.added.length) allNotes.push(`added ${applied.added.length} ${result.kind}`);
            if (applied.merged.length) allNotes.push(`merged ${applied.merged.length} existing ${result.kind}`);
          }
          return next;
        });
      }
      const supplemental = await ingestKinds(id, [
        { kind: "capabilities", files: capFiles },
        { kind: "experience", files: expFiles },
        { kind: "credentials", files: credFiles },
        { kind: "people", files: peopleFiles },
      ]);
      allNotes.push(...supplemental);
      toast(allNotes.length ? `Partner "${created.name}" added — ${allNotes.join("; ")}` : `Partner "${created.name}" added`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Partner added, but document ingest failed", "warning");
    } finally {
      setIngestBusy(false);
    }
    setAddPartnerOpen(false);
    setPartnerName(""); setPartnerWebsite(""); setPartnerSourceLink(""); setPartnerContact(""); setPartnerEmail(""); setPartnerSummary("");
    setPartnerTeaming(null);
    setPartnerYearFounded(""); setPartnerHqAddress(""); setPartnerHqPhone(""); setPartnerHqEmail("");
    setPartnerPrimaryContact(""); setPartnerHeadcount(""); setPartnerEin(""); setPartnerUei("");
    setPartnerDetailsFiles([]); setCapFiles([]); setExpFiles([]); setCredFiles([]); setPeopleFiles([]);
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
    setEditPartnerYearFounded(p.yearFounded ?? "");
    setEditPartnerHqAddress(p.hqAddress ?? "");
    setEditPartnerHqPhone(p.hqPhone ?? "");
    setEditPartnerHqEmail(p.hqEmail ?? "");
    setEditPartnerPrimaryContact(p.primaryContact ?? "");
    setEditPartnerHeadcount(p.employeeHeadcount ?? "");
    setEditPartnerEin(p.ein ?? "");
    setEditPartnerUei(p.uei ?? "");
    setEditPartnerDetailsFiles([]); setEditCapFiles([]); setEditExpFiles([]); setEditCredFiles([]); setEditPeopleFiles([]);
  }

  async function handleSavePartner() {
    if (!editPartner || !editPartnerName.trim()) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const detailsFileName = editPartnerDetailsFiles[0]?.name;
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
            yearFounded: editPartnerYearFounded.trim() || undefined,
            hqAddress: editPartnerHqAddress.trim() || undefined,
            hqPhone: editPartnerHqPhone.trim() || undefined,
            hqEmail: editPartnerHqEmail.trim() || undefined,
            primaryContact: editPartnerPrimaryContact.trim() || undefined,
            employeeHeadcount: editPartnerHeadcount.trim() || undefined,
            ein: editPartnerEin.trim() || undefined,
            uei: editPartnerUei.trim() || undefined,
            partnerDetailsFileName: detailsFileName ?? p.partnerDetailsFileName,
            partnerDetailsUploadedAt: detailsFileName ? stamp : p.partnerDetailsUploadedAt,
            capabilityUploadFileName: editCapFiles[0]?.name ?? (detailsFileName ? `(from ${detailsFileName})` : p.capabilityUploadFileName),
            capabilityUploadedAt: (editCapFiles.length || detailsFileName) ? stamp : p.capabilityUploadedAt,
            experienceUploadFileName: editExpFiles[0]?.name ?? (detailsFileName ? `(from ${detailsFileName})` : p.experienceUploadFileName),
            experienceUploadedAt: (editExpFiles.length || detailsFileName) ? stamp : p.experienceUploadedAt,
            credentialUploadFileName: editCredFiles[0]?.name ?? (detailsFileName ? `(from ${detailsFileName})` : p.credentialUploadFileName),
            credentialUploadedAt: (editCredFiles.length || detailsFileName) ? stamp : p.credentialUploadedAt,
            peopleUploadFileName: editPeopleFiles[0]?.name ?? (detailsFileName ? `(from ${detailsFileName})` : p.peopleUploadFileName),
            peopleUploadedAt: (editPeopleFiles.length || detailsFileName) ? stamp : p.peopleUploadedAt,
          }
        : p
    ));
    setIngestBusy(true);
    try {
      const allNotes: string[] = [];
      if (editPartnerDetailsFiles.length) {
        const detailsResult = await ingestPartnerDetailsFile(editPartnerDetailsFiles);
        if (detailsResult.warning) toast(detailsResult.warning, "warning");
        onUpdateGraph(prev => {
          let next = prev;
          for (const result of detailsResult.results) {
            const applied = applyPartnerIngest(next, editPartner.id, result);
            next = applied.graph;
            if (applied.added.length) allNotes.push(`added ${applied.added.length} ${result.kind}`);
            if (applied.merged.length) allNotes.push(`merged ${applied.merged.length} existing ${result.kind}`);
          }
          return next;
        });
      }
      const supplemental = await ingestKinds(editPartner.id, [
        { kind: "capabilities", files: editCapFiles },
        { kind: "experience", files: editExpFiles },
        { kind: "credentials", files: editCredFiles },
        { kind: "people", files: editPeopleFiles },
      ]);
      allNotes.push(...supplemental);
      toast(allNotes.length ? `Partner updated — ${allNotes.join("; ")}` : "Partner updated", "success");
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

  function openCredential(credential: GraphCredential) {
    setDetailCred(credential);
  }

  function openEditCredential(credential: GraphCredential) {
    setEditCred(credential);
    setEditCredType(credential.credType || "Certification");
    setEditCredExpiration(credential.expiration === "TBD" ? "" : credential.expiration);
    setCredDocFiles([]);
  }

  async function handleSaveCredential() {
    if (!editCred) return;
    let docUpdate: Partial<GraphCredential> = {};
    if (credDocFiles.length > 0) {
      setIngestBusy(true);
      try {
        const result = await ingestPartnerDocuments("credentials", credDocFiles);
        if (result.credentials.length > 0) {
          const parsed = result.credentials[0]!;
          docUpdate = {
            documentText: parsed.documentText,
            documentFileName: parsed.documentFileName,
          };
        }
        if (result.warning) toast(result.warning, "warning");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Document parse failed", "warning");
      } finally {
        setIngestBusy(false);
      }
    }
    const next = {
      credType: editCredType,
      expiration: normalizeDateEntry(editCredExpiration).trim() || "TBD",
      updated: new Date().toISOString().slice(0, 10),
      ...docUpdate,
    };
    onUpdateGraph(prev => ({
      ...prev,
      credentials: prev.credentials.map(c => c.id === editCred.id ? { ...c, ...next } : c),
    }));
    toast("Credential updated", "success");
    setEditCred(null);
    setCredDocFiles([]);
    setDetailCred(prev => prev && prev.id === editCred.id ? { ...prev, ...next } : prev);
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
          const additional: PartnerIngestResult = { ...result, people: result.people.slice(1) };
          const preview = applyPartnerIngest(graph, editPerson.partner, additional);
          onUpdateGraph(prev => applyPartnerIngest(prev, editPerson.partner, additional).graph);
          const mergedCount = preview.merged.length;
          toast(
            `Found ${result.people.length} people in the document — ${preview.added.length} added${mergedCount ? `, ${mergedCount} existing record${mergedCount === 1 ? "" : "s"} updated` : ""}`,
            "success",
          );
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

  const matchesSearch = (fields: (string | null | undefined)[]) => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return true;
    return fields.some(field => (field ?? "").toLowerCase().includes(q));
  };
  const partnerNames = (ids: string[]) => ids.map(id => partnerName2(id)).join(", ");
  const teamingLabel = (flag: boolean | null) => flag === true ? "Signed" : flag === false ? "Pending" : "N/A";
  const visibleCapabilities = capabilities.filter(c =>
    isActive(c.status)
    && matchesSearch([c.id, c.name, partnerNames(c.partners), c.updated])
  ).sort((a, b) => {
    const { field, dir } = capSort;
    if (field === "id") return cmp(a.id, b.id, dir);
    if (field === "partners") return cmp(a.partners.map(id => partnerName2(id)).join(", "), b.partners.map(id => partnerName2(id)).join(", "), dir);
    if (field === "updated") return cmp(a.updated, b.updated, dir);
    return cmp(a.name, b.name, dir);
  });
  const capabilityPageCount = Math.max(1, Math.ceil(visibleCapabilities.length / capPageSize));
  const capabilityPage = Math.min(capPage, capabilityPageCount);
  const pagedCapabilities = visibleCapabilities.slice(
    (capabilityPage - 1) * capPageSize,
    capabilityPage * capPageSize,
  );
  const visibleExperience = experience.filter(e =>
    isActive(e.status)
    && matchesSearch([e.id, e.name, e.industry, partnerNames(e.partners)])
  ).sort((a, b) => {
    const { field, dir } = expSort;
    if (field === "id") return cmp(a.id, b.id, dir);
    if (field === "industry") return cmp(a.industry || "", b.industry || "", dir);
    if (field === "partners") return cmp(a.partners.map(id => partnerName2(id)).join(", "), b.partners.map(id => partnerName2(id)).join(", "), dir);
    return cmp(a.name, b.name, dir);
  });
  const visibleCredentials = credentials.filter(c =>
    isActive(c.status)
    && matchesSearch([c.id, c.name, c.credType, partnerName2(c.partner), c.expiration])
  ).sort((a, b) => {
    const { field, dir } = credSort;
    if (field === "id") return cmp(a.id, b.id, dir);
    if (field === "credType") return cmp(a.credType, b.credType, dir);
    if (field === "partner") return cmp(partnerName2(a.partner), partnerName2(b.partner), dir);
    if (field === "expiration") return cmp(a.expiration, b.expiration, dir);
    return cmp(a.name, b.name, dir);
  });
  const visiblePeople = people.filter(p =>
    isActive(p.status)
    && matchesSearch([p.id, p.name, partnerName2(p.partner), (p.roles ?? [p.role]).filter(Boolean).join(", ") || p.role, p.expertise])
  ).sort((a, b) => {
    const { field, dir } = peopleSort;
    if (field === "id") return cmp(a.id, b.id, dir);
    if (field === "partner") return cmp(partnerName2(a.partner), partnerName2(b.partner), dir);
    if (field === "role") return cmp((a.roles ?? [a.role]).filter(Boolean).join(", "), (b.roles ?? [b.role]).filter(Boolean).join(", "), dir);
    if (field === "expertise") return cmp(a.expertise, b.expertise, dir);
    return cmp(a.name, b.name, dir);
  });
  const visiblePartners = partners.filter(p =>
    (showArchived || isActive(p.status))
    && matchesSearch([p.name, p.type, p.contact, p.contactEmail, teamingLabel(p.teamingAgreementSigned), p.status])
  ).sort((a, b) => {
    const { field, dir } = partnerSort;
    if (field === "type") return cmp(a.type, b.type, dir);
    if (field === "contact") return cmp(a.contact || "", b.contact || "", dir);
    if (field === "teaming") return cmpTeaming(a.teamingAgreementSigned, b.teamingAgreementSigned, dir);
    return cmp(a.name, b.name, dir);
  });

  function playPartners(play: Play): string[] {
    const names = new Set<string>();
    for (const ref of [...play.capabilities, ...play.experiences, ...play.credentials, ...play.people]) {
      if (ref.partner) names.add(ref.partner);
    }
    return [...names];
  }

  function playStatusLabel(play: Play): string {
    if (play.origin === "proposed" && play.status !== "active") return "Proposed";
    if (play.origin === "proposed") return play.proven ? "Approved · Proven" : "Approved · Unproven";
    return play.proven ? "Proven" : "Unproven";
  }

  function submitProposal() {
    const name = proposeName.trim();
    const problem = proposeProblem.trim();
    if (!name || !problem) return;
    onProposePlay({
      name,
      problem,
      sector: proposeSector.trim(),
      orgType: proposeOrgType.trim(),
      services: proposeServices.split(",").map(service => service.trim()).filter(Boolean),
    });
    setProposeName("");
    setProposeProblem("");
    setProposeSector("");
    setProposeOrgType("");
    setProposeServices("");
    setProposeOpen(false);
  }

  const visiblePlays = plays.filter(play =>
    matchesSearch([
      play.name,
      play.problem,
      playStatusLabel(play),
      play.origin === "proposed" ? "proposed" : "",
      String(play.assessment?.fit ?? ""),
      ...play.coverageGaps.map(gap => gap.service),
      ...playPartners(play),
      ...play.targetOrganizations.sectors,
      ...play.targetOrganizations.types,
    ])
  ).sort((a, b) => {
    const { field, dir } = playSort;
    if (field === "proven") return cmp(playStatusLabel(a), playStatusLabel(b), dir);
    if (field === "fit") {
      const delta = (a.assessment?.fit ?? -1) - (b.assessment?.fit ?? -1);
      return dir === "asc" ? delta : -delta;
    }
    if (field === "partners") return cmp(playPartners(a).join(", "), playPartners(b).join(", "), dir);
    if (field === "experience") {
      const delta = a.strength.experienceCount - b.strength.experienceCount;
      return dir === "asc" ? delta : -delta;
    }
    return cmp(a.name, b.name, dir);
  });

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
        <h1 className="oe-page-title">Partner Network</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The Capability & Experience Graph — the single source of truth for what the consortium can deliver (I1, CEG-04).
        </p>
      </div>

      <div className="flex flex-col gap-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="bg-muted/60 inline-flex w-fit max-w-full p-1 rounded-xl gap-1 overflow-x-auto oe-touch-scroll">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setSearchQ(""); }}
                className={cn(
                  "px-4 py-2 text-xs font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap",
                  tab === t.id
                    ? "bg-card text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                <span className="ml-2 text-[10px] font-mono opacity-60">{t.count}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder={tab === "partners" ? "Search partners…" : tab === "plays" ? "Search plays…" : "Search…"}
              className="oe-field text-xs w-full sm:w-56"
            />
            {tab === "partners" && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="rounded" />
                Show archived
              </label>
            )}
            {tab === "plays" && (
              <button
                onClick={() => setProposeOpen(true)}
                className="shrink-0 text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm whitespace-nowrap"
              >
                + Propose a play
              </button>
            )}
            {tab !== "plays" && (
              <button
                onClick={() => {
                  if (tab === "capabilities") setAddCapOpen(true);
                  else if (tab === "experience") setAddExpOpen(true);
                  else if (tab === "credentials") setAddCredOpen(true);
                  else if (tab === "people") setAddPersonOpen(true);
                  else if (tab === "partners") setAddPartnerOpen(true);
                }}
                className="shrink-0 text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground cursor-pointer transition-all hover:bg-primary/90 shadow-sm whitespace-nowrap"
              >
                + Add {tab === "capabilities" ? "Capability" : tab === "experience" ? "Experience" : tab === "credentials" ? "Credential" : tab === "people" ? "Person" : "Partner"}
              </button>
            )}
          </div>
        </div>
      </div>

      {tab === "capabilities" && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="oe-table-header">
                  <SortableHeader label="ID" field="id" current={capSort} onClick={() => setCapSort(s => toggleSort(s, "id"))} />
                  <SortableHeader label="Capability" field="name" current={capSort} onClick={() => setCapSort(s => toggleSort(s, "name"))} />
                  <SortableHeader label="Partners" field="partners" current={capSort} onClick={() => setCapSort(s => toggleSort(s, "partners"))} />
                  <SortableHeader label="Updated" field="updated" current={capSort} onClick={() => setCapSort(s => toggleSort(s, "updated"))} />
                </tr>
              </thead>
              <tbody>
                {pagedCapabilities.map(c => (
                  <tr key={c.id} className="oe-table-row border-b border-border last:border-b-0 cursor-pointer" onClick={() => setDetailCap(c)}>
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{c.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.partners.map(id => partnerName2(id)).join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.updated}</td>
                  </tr>
                ))}
                {visibleCapabilities.length === 0 && (
                  <EmptyFilterRow colSpan={4} noun="capabilities" filtered={Boolean(searchQ)} />
                )}
              </tbody>
            </table>
          </div>
          <CapabilityPagination
            page={capabilityPage}
            pageSize={capPageSize}
            total={visibleCapabilities.length}
            onPageChange={setCapPage}
            onPageSizeChange={setCapPageSize}
          />
        </div>
      )}

      {tab === "experience" && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="oe-table-header">
                  <SortableHeader label="ID" field="id" current={expSort} onClick={() => setExpSort(s => toggleSort(s, "id"))} />
                  <SortableHeader label="Experience" field="name" current={expSort} onClick={() => setExpSort(s => toggleSort(s, "name"))} />
                  <SortableHeader label="Industry" field="industry" current={expSort} onClick={() => setExpSort(s => toggleSort(s, "industry"))} />
                  <SortableHeader label="Partners" field="partners" current={expSort} onClick={() => setExpSort(s => toggleSort(s, "partners"))} />
                </tr>
              </thead>
              <tbody>
                {visibleExperience.map(e => (
                  <tr key={e.id} className="oe-table-row border-b border-border last:border-b-0 cursor-pointer" onClick={() => setDetailExp(e)}>
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{e.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{e.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{e.industry || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.partners.map(id => partnerName2(id)).join(", ") || "—"}</td>
                  </tr>
                ))}
                {visibleExperience.length === 0 && (
                  <EmptyFilterRow colSpan={4} noun="experience" filtered={Boolean(searchQ)} />
                )}
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
                  <SortableHeader label="ID" field="id" current={credSort} onClick={() => setCredSort(s => toggleSort(s, "id"))} />
                  <SortableHeader label="Credential" field="name" current={credSort} onClick={() => setCredSort(s => toggleSort(s, "name"))} />
                  <SortableHeader label="Type" field="credType" current={credSort} onClick={() => setCredSort(s => toggleSort(s, "credType"))} />
                  <SortableHeader label="Partner" field="partner" current={credSort} onClick={() => setCredSort(s => toggleSort(s, "partner"))} />
                  <SortableHeader label="Expiration" field="expiration" current={credSort} onClick={() => setCredSort(s => toggleSort(s, "expiration"))} />
                </tr>
              </thead>
              <tbody>
                {visibleCredentials.map(c => (
                  <tr key={c.id} className="oe-table-row border-b border-border last:border-b-0 cursor-pointer" onClick={() => openCredential(c)}>
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{c.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.credType}</td>
                    <td className="px-4 py-3 text-muted-foreground">{partnerName2(c.partner)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.expiration}</td>
                  </tr>
                ))}
                {visibleCredentials.length === 0 && (
                  <EmptyFilterRow colSpan={5} noun="credentials" filtered={Boolean(searchQ)} />
                )}
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
                  <SortableHeader label="Name" field="name" current={peopleSort} onClick={() => setPeopleSort(s => toggleSort(s, "name"))} />
                  <SortableHeader label="Partner" field="partner" current={peopleSort} onClick={() => setPeopleSort(s => toggleSort(s, "partner"))} />
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Role</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5 hidden xl:table-cell">Expertise</th>
                </tr>
              </thead>
              <tbody>
                {visiblePeople.map(p => (
                  <tr key={p.id} className="oe-table-row border-b border-border last:border-b-0 cursor-pointer" onClick={() => setDetailPerson(p)}>
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{p.id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{partnerName2(p.partner)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{(p.roles ?? [p.role]).filter(Boolean).join(", ") || p.role}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[400px] truncate hidden xl:table-cell">{p.expertise}</td>
                  </tr>
                ))}
                {visiblePeople.length === 0 && (
                  <EmptyFilterRow colSpan={5} noun="people" filtered={Boolean(searchQ)} />
                )}
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
                  <SortableHeader label="Partner" field="name" current={partnerSort} onClick={() => setPartnerSort(s => toggleSort(s, "name"))} />
                  <SortableHeader label="Type" field="type" current={partnerSort} onClick={() => setPartnerSort(s => toggleSort(s, "type"))} />
                  <SortableHeader label="Contact" field="contact" current={partnerSort} onClick={() => setPartnerSort(s => toggleSort(s, "contact"))} />
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Email</th>
                  <SortableHeader label="Teaming Agreement" field="teaming" current={partnerSort} onClick={() => setPartnerSort(s => toggleSort(s, "teaming"))} />
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Status</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visiblePartners.map(p => (
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
                {visiblePartners.length === 0 && (
                  <EmptyFilterRow colSpan={7} noun="partners" filtered={Boolean(searchQ)} />
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "plays" && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Consortium Plays</h3>
            <span className="text-xs text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">{visiblePlays.length}</span>
              {" "}play{visiblePlays.length === 1 ? "" : "s"} from Partner records and proposals
            </span>
          </div>
          <div className="overflow-x-auto oe-touch-scroll">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="oe-table-header">
                  <SortableHeader label="Play" field="name" current={playSort} onClick={() => setPlaySort(s => toggleSort(s, "name"))} />
                  <SortableHeader label="Status" field="proven" current={playSort} onClick={() => setPlaySort(s => toggleSort(s, "proven"))} />
                  <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-2.5">Problem</th>
                  <SortableHeader label="Experience" field="experience" current={playSort} onClick={() => setPlaySort(s => toggleSort(s, "experience"))} />
                  <SortableHeader label="Partners" field="partners" current={playSort} onClick={() => setPlaySort(s => toggleSort(s, "partners"))} />
                  <SortableHeader label="Fit" field="fit" current={playSort} onClick={() => setPlaySort(s => toggleSort(s, "fit"))} />
                </tr>
              </thead>
              <tbody>
                {visiblePlays.map(play => (
                  <tr key={play.playId} className="oe-table-row border-b border-border last:border-b-0 cursor-pointer" onClick={() => setDetailPlay(play)}>
                    <td className="px-4 py-3 font-semibold text-foreground">{play.name}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
                        play.origin === "proposed" && play.status !== "active"
                          ? "oe-status-cond"
                          : play.proven ? "oe-status-go" : "oe-status-cond"
                      )}>
                        {playStatusLabel(play)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[420px] truncate">{play.problem || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{play.strength.experienceCount}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{playPartners(play).join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {play.origin === "proposed" ? play.assessment?.fit ?? "—" : "—"}
                    </td>
                  </tr>
                ))}
                {visiblePlays.length === 0 && (
                  <EmptyFilterRow colSpan={6} noun="plays" filtered={Boolean(searchQ)} />
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={detailPlay !== null} onClose={() => setDetailPlay(null)} title={detailPlay?.name ?? "Play"} wide>
        {detailPlay && (() => {
          const play = plays.find(item => item.playId === detailPlay.playId) ?? detailPlay;
          const approver = profile?.displayName || profile?.email || "Operator";
          return (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md",
                play.origin === "proposed" && play.status !== "active"
                  ? "oe-status-cond"
                  : play.proven ? "oe-status-go" : "oe-status-cond"
              )}>
                {playStatusLabel(play)}
              </span>
              {play.origin === "proposed" && (
                <span className="font-mono text-muted-foreground">Fit {play.assessment?.fit ?? 0}</span>
              )}
              <span className="text-muted-foreground">
                {play.strength.experienceCount} experience · {play.strength.partnerCount} partner{play.strength.partnerCount === 1 ? "" : "s"}
                {play.strength.solicitationsSeen > 0 ? ` · ${play.strength.solicitationsSeen} solicitation${play.strength.solicitationsSeen === 1 ? "" : "s"}` : ""}
              </span>
            </div>
            {play.problem && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Problem</h4>
                <p className="text-muted-foreground">{play.problem}</p>
              </div>
            )}
            {play.assessment?.transferable && (
              <p className="text-muted-foreground">
                Transferable experience is partial credit. The problem was delivered in another industry, so it is not a proven play for the target sector until a Partner Experience records that combination.
              </p>
            )}
            <div>
              <h4 className="text-xs font-semibold mb-1">Partners</h4>
              <p className="text-muted-foreground">{playPartners(play).join(", ") || "—"}</p>
            </div>
            {play.targetOrganizations.sectors.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Target sectors</h4>
                <p className="text-muted-foreground">{play.targetOrganizations.sectors.join(", ")}</p>
              </div>
            )}
            {play.assessment && play.assessment.experienceCredits.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Experience credit</h4>
                <ul className="space-y-2 text-muted-foreground">
                  {play.assessment.experienceCredits.map(credit => (
                    <li key={credit.recordId}>
                      <span className="text-foreground">{credit.summary}</span>
                      {" — "}{credit.partner}
                      {credit.industry ? ` · ${credit.industry}` : ""}
                      <div>{credit.reason}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {play.origin !== "proposed" && play.experiences.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Experience</h4>
                <ul className="space-y-1 text-muted-foreground">
                  {play.experiences.map((ref, index) => (
                    <li key={`${ref.recordId}-${ref.partner}-${index}`}>{ref.summary} — {ref.partner}</li>
                  ))}
                </ul>
              </div>
            )}
            {play.origin === "proposed" && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Coverage gaps</h4>
                {play.coverageGaps.length === 0 ? (
                  <p className="text-muted-foreground">No coverage gaps. Partner records cover the proposed problem.</p>
                ) : (
                  <ul className="space-y-2">
                    {play.coverageGaps.map(gap => (
                      <li key={gap.service} className="rounded-md border border-border bg-muted/40 px-3 py-2">
                        <div className="font-semibold text-foreground">{gap.service}</div>
                        <div className="text-muted-foreground mt-0.5">{gap.evidence}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {play.origin !== "proposed" && play.coverageGaps.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Coverage gaps</h4>
                <ul className="space-y-2">
                  {play.coverageGaps.map(gap => (
                    <li key={gap.service} className="rounded-md border border-border bg-muted/40 px-3 py-2">
                      <div className="font-semibold text-foreground">{gap.service}</div>
                      <div className="text-muted-foreground mt-0.5">{gap.evidence}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {play.solicitations.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Solicitations</h4>
                <ul className="space-y-1 text-muted-foreground">
                  {play.solicitations.map(item => (
                    <li key={item.solicitationId}>
                      {item.type} · {item.issuer} · {item.outcome} · {item.date}
                      {item.reason ? ` — ${item.reason}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {play.strength.notes && (
              <p className="text-muted-foreground">{play.strength.notes}</p>
            )}
            {play.origin === "proposed" && play.status !== "active" && (
              <div className="flex justify-end pt-1">
                <PrimaryButton onClick={() => onApprovePlay(play.playId, approver)}>Approve play</PrimaryButton>
              </div>
            )}
          </div>
          );
        })()}
      </Modal>

      <Modal open={proposeOpen} onClose={() => setProposeOpen(false)} title="Propose a play" wide>
        <div className="space-y-4">
          <FormField label="Play name" hint="The customer problem, not a technology.">
            <TextInput value={proposeName} onChange={setProposeName} placeholder="e.g. Claims migration" />
          </FormField>
          <FormField label="Problem">
            <TextArea value={proposeProblem} onChange={setProposeProblem} rows={4} placeholder="Who has this need, and what would the consortium deliver?" />
          </FormField>
          <FormField label="Target sector" hint="Leave blank if the play is not tied to one industry.">
            <TextInput value={proposeSector} onChange={setProposeSector} placeholder="e.g. Public Transit" />
          </FormField>
          <FormField label="Organization type">
            <TextInput value={proposeOrgType} onChange={setProposeOrgType} placeholder="e.g. transit or special district" />
          </FormField>
          <FormField label="Services the play needs" hint="Comma-separated. Uncovered services become coverage gaps.">
            <TextInput value={proposeServices} onChange={setProposeServices} placeholder="e.g. Claims Migration, Fare adjudication" />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setProposeOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={submitProposal} disabled={!proposeName.trim() || !proposeProblem.trim()}>Score play</PrimaryButton>
          </div>
        </div>
      </Modal>

      <Modal open={detailPartner !== null} onClose={() => setDetailPartnerId(null)} title={detailPartner?.name ?? "Partner Details"} wide>
        {detailPartner && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-muted-foreground">Type:</span> <strong>{detailPartner.type}</strong></div>
              <div><span className="text-muted-foreground">Status:</span> <strong>{detailPartner.status}</strong></div>
              <div><span className="text-muted-foreground">Teaming agreement:</span> <strong>{detailPartner.teamingAgreementSigned === true ? "Signed" : detailPartner.teamingAgreementSigned === false ? "Pending" : "N/A"}</strong></div>
              <div><span className="text-muted-foreground">Website:</span> {detailPartner.website !== "—" ? <a href={detailPartner.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{detailPartner.website}</a> : "—"}</div>
              <div><span className="text-muted-foreground">Date added:</span> {detailPartner.createdAt || "—"}</div>
              <div><span className="text-muted-foreground">Primary contact:</span> {detailPartner.primaryContact || detailPartner.contact}</div>
              <div><span className="text-muted-foreground">Contact email:</span> {detailPartner.contactEmail || "—"}</div>
              {detailPartner.yearFounded && <div><span className="text-muted-foreground">Year founded:</span> {detailPartner.yearFounded}</div>}
              {detailPartner.hqAddress && <div className="col-span-2"><span className="text-muted-foreground">HQ address:</span> {detailPartner.hqAddress}</div>}
              {detailPartner.hqPhone && <div><span className="text-muted-foreground">HQ phone:</span> {detailPartner.hqPhone}</div>}
              {detailPartner.hqEmail && <div><span className="text-muted-foreground">HQ email:</span> {detailPartner.hqEmail}</div>}
              {detailPartner.employeeHeadcount && <div><span className="text-muted-foreground">Employees:</span> {detailPartner.employeeHeadcount}</div>}
              {detailPartner.ein && <div><span className="text-muted-foreground">EIN:</span> <span className="font-mono">{detailPartner.ein}</span></div>}
              {detailPartner.uei && <div><span className="text-muted-foreground">UEI:</span> <span className="font-mono">{detailPartner.uei}</span></div>}
            </div>
            {(detailPartner.summary || detailPartner.note) && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Summary</h4>
                <p className="text-xs text-muted-foreground">{detailPartner.summary || detailPartner.note}</p>
              </div>
            )}
            {(detailPartner.partnerDetailsFileName || detailPartner.capabilityUploadFileName || detailPartner.experienceUploadFileName || detailPartner.credentialUploadFileName || detailPartner.peopleUploadFileName) && (
              <div className="border-t border-border pt-3">
                <h4 className="text-xs font-semibold mb-2">Documents on File</h4>
                <div className="space-y-1 text-xs">
                  {detailPartner.partnerDetailsFileName && (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                      <span className="font-medium">Partner Details:</span>
                      <span className="text-muted-foreground truncate">{detailPartner.partnerDetailsFileName}</span>
                      {detailPartner.partnerDetailsUploadedAt && <span className="text-muted-foreground/70 shrink-0">· {detailPartner.partnerDetailsUploadedAt}</span>}
                    </div>
                  )}
                  {detailPartner.capabilityUploadFileName && (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground">
                      <span className="font-medium text-foreground">Capabilities:</span>
                      <span className="truncate">{detailPartner.capabilityUploadFileName}</span>
                      {detailPartner.capabilityUploadedAt && <span className="text-muted-foreground/70 shrink-0">· {detailPartner.capabilityUploadedAt}</span>}
                    </div>
                  )}
                  {detailPartner.experienceUploadFileName && (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground">
                      <span className="font-medium text-foreground">Experience:</span>
                      <span className="truncate">{detailPartner.experienceUploadFileName}</span>
                      {detailPartner.experienceUploadedAt && <span className="text-muted-foreground/70 shrink-0">· {detailPartner.experienceUploadedAt}</span>}
                    </div>
                  )}
                  {detailPartner.credentialUploadFileName && (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground">
                      <span className="font-medium text-foreground">Credentials:</span>
                      <span className="truncate">{detailPartner.credentialUploadFileName}</span>
                      {detailPartner.credentialUploadedAt && <span className="text-muted-foreground/70 shrink-0">· {detailPartner.credentialUploadedAt}</span>}
                    </div>
                  )}
                  {detailPartner.peopleUploadFileName && (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground">
                      <span className="font-medium text-foreground">People:</span>
                      <span className="truncate">{detailPartner.peopleUploadFileName}</span>
                      {detailPartner.peopleUploadedAt && <span className="text-muted-foreground/70 shrink-0">· {detailPartner.peopleUploadedAt}</span>}
                    </div>
                  )}
                </div>
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
              {capabilities.filter(c => c.partners.includes(detailPartner.id)).length === 0 && (
                <div className="text-xs text-muted-foreground italic">None</div>
              )}
              <div className="space-y-1">{capabilities.filter(c => c.partners.includes(detailPartner.id)).map(c => {
                const others = c.partners.filter(id => id !== detailPartner.id).map(id => partnerName2(id));
                return (
                  <button key={c.id} onClick={() => setDetailCap(c)} className="block w-full text-left text-xs text-foreground hover:bg-muted/40 rounded-md px-2 py-1.5">
                    <span className="font-mono text-primary">{c.id}</span> — <span className="font-semibold">{c.name}</span>
                    <span className="text-muted-foreground"> · updated {c.updated}{others.length ? ` · also ${others.join(", ")}` : ""}{c.status === "Archived" ? " · Archived" : ""}</span>
                  </button>
                );
              })}</div>
            </div>
            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold mb-2">Experience</h4>
              {experience.filter(e => e.partners.includes(detailPartner.id)).length === 0 && (
                <div className="text-xs text-muted-foreground italic">None</div>
              )}
              <div className="space-y-1">{experience.filter(e => e.partners.includes(detailPartner.id)).map(e => (
                <button key={e.id} onClick={() => setDetailExp(e)} className="block w-full text-left text-xs text-foreground hover:bg-muted/40 rounded-md px-2 py-1.5">
                  <span className="font-mono text-primary">{e.id}</span> — <span className="font-semibold">{e.name}</span>
                  <span className="text-muted-foreground"> · {e.industry || "No industry"} · updated {e.updated}{e.status === "Archived" ? " · Archived" : ""}</span>
                </button>
              ))}</div>
            </div>
            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold mb-2">Credentials</h4>
              {credentials.filter(c => c.partner === detailPartner.id).length === 0 && (
                <div className="text-xs text-muted-foreground italic">None</div>
              )}
              <div className="space-y-1">{credentials.filter(c => c.partner === detailPartner.id).map(c => (
                <button key={c.id} onClick={() => openCredential(c)} className="block w-full text-left text-xs text-foreground hover:bg-muted/40 rounded-md px-2 py-1.5">
                  <span className="font-mono text-primary">{c.id}</span> — <span className="font-semibold">{c.name}</span>
                  <span className="text-muted-foreground"> · {c.credType}{c.expiration ? `, expires ${c.expiration}` : ""}{c.status === "Archived" ? " · Archived" : ""}</span>
                </button>
              ))}</div>
            </div>
            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold mb-2">People</h4>
              {people.filter(p => p.partner === detailPartner.id).length === 0 && (
                <div className="text-xs text-muted-foreground italic">None</div>
              )}
              <div className="space-y-1">{people.filter(p => p.partner === detailPartner.id).map(p => (
                <button key={p.id} onClick={() => setDetailPerson(p)} className="block w-full text-left text-xs text-foreground hover:bg-muted/40 rounded-md px-2 py-1.5">
                  <span className="font-mono text-primary">{p.id}</span> — <span className="font-semibold">{p.name}</span>
                  <span className="text-muted-foreground"> · {(p.roles ?? [p.role]).filter(Boolean).join(", ") || p.role}{p.status === "Archived" ? " · Archived" : ""}</span>
                </button>
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
            <div><span className="text-muted-foreground">Updated:</span> {liveCap.updated}</div>
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

      <Modal open={liveCred !== null && editCred === null} onClose={() => setDetailCred(null)} title={liveCred?.name ?? "Credential"} wide>
        {liveCred && (
          <div className="space-y-3 text-xs">
            <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{liveCred.id}</span></div>
            <div><span className="text-muted-foreground">Type:</span> {liveCred.credType}</div>
            <div><span className="text-muted-foreground">Partner:</span> {partnerName2(liveCred.partner)}</div>
            <div><span className="text-muted-foreground">Expiration:</span> {liveCred.expiration}</div>
            <div><span className="text-muted-foreground">Updated:</span> {liveCred.updated}</div>
            <div>
              <div className="font-semibold mb-1">Document</div>
              <div className="text-muted-foreground mb-1">{liveCred.documentFileName || "No file name on record"}</div>
              <p className="whitespace-pre-wrap bg-muted/40 rounded-md p-3">{liveCred.documentText || "No document text on file."}</p>
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => { handleDeleteItem("credential", liveCred.id); setDetailCred(null); }} className="text-xs text-destructive cursor-pointer hover:underline">Delete</button>
              <div className="flex gap-2">
                <SecondaryButton onClick={() => openEditCredential(liveCred)}>Edit</SecondaryButton>
                <SecondaryButton onClick={() => setDetailCred(null)}>Close</SecondaryButton>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={editCred !== null} onClose={() => setEditCred(null)} title="Edit Credential" wide>
        {editCred && (
          <div className="space-y-4">
            <FormField label="Type">
              <SelectInput value={editCredType} onChange={setEditCredType} options={credentialTypeOptions(editCredType)} />
            </FormField>
            <FormField label="Expiration date">
              <DateField value={editCredExpiration} onChange={setEditCredExpiration} />
            </FormField>
            <FormField label="Credential document" hint="Upload a new or renewed credential document to replace the existing one.">
              <DocumentDropzone files={credDocFiles} onChange={setCredDocFiles} disabled={ingestBusy} dropLabel="Drop your Credential document here" />
            </FormField>
            <div className="flex justify-end gap-2">
              <SecondaryButton onClick={() => setEditCred(null)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={handleSaveCredential} disabled={ingestBusy}>{ingestBusy ? "Saving…" : "Save"}</PrimaryButton>
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

          <div className="border-t border-border pt-4 mt-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Partner Details File</h4>
            <p className="text-[11px] text-muted-foreground mb-3">
              Upload a new Partner Details document to refresh corporate information and re-process capabilities, experience, credentials, and people. Existing manual overrides will be preserved.
            </p>
            <FileUploadInfo fileName={editPartner?.partnerDetailsFileName} uploadedAt={editPartner?.partnerDetailsUploadedAt} />
            <div className={editPartner?.partnerDetailsFileName ? "mt-2" : ""}>
              <DocumentDropzone
                files={editPartnerDetailsFiles}
                onChange={handleEditPartnerDetailsUpload}
                disabled={ingestBusy || editDetailsProcessing}
                dropLabel="Drop your Partner Details document here"
              />
            </div>
            {editDetailsProcessing && (
              <div className="flex items-center gap-2 mt-2 text-xs text-primary">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Extracting corporate information…
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4 mt-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Corporate Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Year founded">
                <TextInput value={editPartnerYearFounded} onChange={setEditPartnerYearFounded} placeholder="e.g. 2018" />
              </FormField>
              <FormField label="Employee headcount">
                <TextInput value={editPartnerHeadcount} onChange={setEditPartnerHeadcount} placeholder="e.g. 85" />
              </FormField>
              <FormField label="Primary contact">
                <TextInput value={editPartnerPrimaryContact} onChange={setEditPartnerPrimaryContact} placeholder="e.g. Jordan Hale" />
              </FormField>
              <FormField label="HQ phone">
                <TextInput value={editPartnerHqPhone} onChange={setEditPartnerHqPhone} placeholder="e.g. (503) 555-0142" />
              </FormField>
              <FormField label="HQ email">
                <TextInput value={editPartnerHqEmail} onChange={setEditPartnerHqEmail} type="email" placeholder="e.g. info@company.com" />
              </FormField>
              <FormField label="EIN">
                <TextInput value={editPartnerEin} onChange={setEditPartnerEin} placeholder="e.g. 83-1234567" />
              </FormField>
              <FormField label="UEI">
                <TextInput value={editPartnerUei} onChange={setEditPartnerUei} placeholder="e.g. U8K9UNSG001" />
              </FormField>
            </div>
            <div className="mt-4">
              <FormField label="HQ address">
                <TextInput value={editPartnerHqAddress} onChange={setEditPartnerHqAddress} placeholder="e.g. 1200 NW Marshall St, Suite 400, Portland, OR 97209" />
              </FormField>
            </div>
          </div>
          <FormField label="Teaming agreement">
            <TeamingToggle value={editPartnerTeaming} onChange={setEditPartnerTeaming} />
          </FormField>

          <div className="border-t border-border pt-4 mt-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Additional Document Uploads</h4>
            <p className="text-[11px] text-muted-foreground mb-3">
              {editPartnerDetailsFiles.length
                ? "The Partner Details file above will be re-processed for all sections. Upload additional files here only for supplemental documents."
                : "Upload documents per section, or use the Partner Details file above to process all sections at once."
              }
            </p>
          </div>
          <FormField label="Capability documents">
            <FileUploadInfo fileName={editPartner?.capabilityUploadFileName} uploadedAt={editPartner?.capabilityUploadedAt} />
            <DocumentDropzone files={editCapFiles} onChange={setEditCapFiles} disabled={ingestBusy} dropLabel="Drop the Capability Statements here" />
          </FormField>
          <FormField label="Experience documents">
            <FileUploadInfo fileName={editPartner?.experienceUploadFileName} uploadedAt={editPartner?.experienceUploadedAt} />
            <DocumentDropzone files={editExpFiles} onChange={setEditExpFiles} disabled={ingestBusy} dropLabel="Drop the Experience/Project Summaries here" />
          </FormField>
          <FormField label="Credential documents">
            <FileUploadInfo fileName={editPartner?.credentialUploadFileName} uploadedAt={editPartner?.credentialUploadedAt} />
            <DocumentDropzone files={editCredFiles} onChange={setEditCredFiles} disabled={ingestBusy} dropLabel="Drop your Certification, Insurance, Bonding, and Other Credential documents here" />
          </FormField>
          <FormField label="People / resume documents">
            <FileUploadInfo fileName={editPartner?.peopleUploadFileName} uploadedAt={editPartner?.peopleUploadedAt} />
            <DocumentDropzone files={editPeopleFiles} onChange={setEditPeopleFiles} disabled={ingestBusy} dropLabel="Drop your Resumes here" />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setEditPartner(null)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSavePartner} disabled={!editPartnerName.trim() || ingestBusy || editDetailsProcessing}>{ingestBusy ? "Saving…" : "Save"}</PrimaryButton>
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
            <SelectInput value={credType} onChange={setCredType} options={CREDENTIAL_TYPES} />
          </FormField>
          <FormField label="Partner">
            <SelectInput value={credPartner} onChange={setCredPartner} options={[{ value: "", label: "Select partner…" }, ...partnerOptions]} />
          </FormField>
          <FormField label="Expiration date">
            <DateField value={credExpiration} onChange={setCredExpiration} />
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

          <div className="border-t border-border pt-4 mt-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Partner Details File</h4>
            <p className="text-[11px] text-muted-foreground mb-3">
              Upload a single Partner Details document to auto-populate corporate information below and extract capabilities, experience, credentials, and people all at once. You can still override any field and upload additional files per section.
            </p>
            <DocumentDropzone
              files={partnerDetailsFiles}
              onChange={handlePartnerDetailsUpload}
              disabled={ingestBusy || detailsProcessing}
              dropLabel="Drop your Partner Details document here"
            />
            {detailsProcessing && (
              <div className="flex items-center gap-2 mt-2 text-xs text-primary">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Extracting corporate information…
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4 mt-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Corporate Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Year founded (optional)">
                <TextInput value={partnerYearFounded} onChange={setPartnerYearFounded} placeholder="e.g. 2018" />
              </FormField>
              <FormField label="Employee headcount (optional)">
                <TextInput value={partnerHeadcount} onChange={setPartnerHeadcount} placeholder="e.g. 85" />
              </FormField>
              <FormField label="Primary contact (optional)">
                <TextInput value={partnerPrimaryContact} onChange={setPartnerPrimaryContact} placeholder="e.g. Jordan Hale" />
              </FormField>
              <FormField label="HQ phone (optional)">
                <TextInput value={partnerHqPhone} onChange={setPartnerHqPhone} placeholder="e.g. (503) 555-0142" />
              </FormField>
              <FormField label="HQ email (optional)">
                <TextInput value={partnerHqEmail} onChange={setPartnerHqEmail} type="email" placeholder="e.g. info@company.com" />
              </FormField>
              <FormField label="EIN (optional)">
                <TextInput value={partnerEin} onChange={setPartnerEin} placeholder="e.g. 83-1234567" />
              </FormField>
              <FormField label="UEI (optional)">
                <TextInput value={partnerUei} onChange={setPartnerUei} placeholder="e.g. U8K9UNSG001" />
              </FormField>
            </div>
            <div className="mt-4">
              <FormField label="HQ address (optional)">
                <TextInput value={partnerHqAddress} onChange={setPartnerHqAddress} placeholder="e.g. 1200 NW Marshall St, Suite 400, Portland, OR 97209" />
              </FormField>
            </div>
          </div>
          <FormField label="Teaming agreement">
            <TeamingToggle value={partnerTeaming} onChange={setPartnerTeaming} />
          </FormField>

          <div className="border-t border-border pt-4 mt-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Additional Document Uploads</h4>
            <p className="text-[11px] text-muted-foreground mb-3">
              {partnerDetailsFiles.length
                ? "The Partner Details file above will be processed for all sections below. Upload additional files here only if you have supplemental documents (e.g. new resumes, updated credentials)."
                : "Upload documents per section, or use the Partner Details file above to process all sections at once."
              }
            </p>
          </div>
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
            <PrimaryButton onClick={handleAddPartner} disabled={!partnerName.trim() || ingestBusy || detailsProcessing}>{ingestBusy ? "Ingesting…" : "Add Partner"}</PrimaryButton>
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
