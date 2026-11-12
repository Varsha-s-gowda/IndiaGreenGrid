import { Link } from "react-router-dom";
import {
  ArrowRight,
  BatteryCharging,
  Building2,
  Calculator,
  CloudSun,
  Gauge,
  Landmark,
  Leaf,
  ReceiptText,
  RefreshCw,
  Recycle,
  Ruler,
  Scale,
  Sun,
  Target,
  Users,
  Zap,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import { SampleNotice } from "../../components/platform/DataBadges";
import { useAuth } from "../../context/AuthContext";
import useApiData from "../../hooks/useApiData";
import { formatNumber } from "../../lib/formatters";
import { canAccessPath } from "../../lib/workspaces";
import { getDashboardOverview } from "../../services/platformService";
import { getApartmentSummary } from "../../services/solarTwinService";

const MODULES = [
  {
    key: "simulation",
    title: "SolarTwin",
    subtitle: "Generation & consumption",
    to: "/simulation",
    icon: Sun,
    description:
      "Hourly solar generation, apartment consumption, common-area loads and the society energy balance.",
  },
  {
    key: "allocation",
    title: "Fair allocation",
    subtitle: "Benefit sharing",
    to: "/allocation",
    icon: Scale,
    description:
      "Compare allocation methods, run a fair share for all flats, inspect hourly and monthly records, and test what-if scenarios.",
    residentDescription:
      "See how your share of the society solar generation is calculated, with the daily records behind your statement.",
  },
  {
    key: "billing",
    title: "BillFair",
    subtitle: "Billing & audit",
    to: "/billing",
    icon: ReceiptText,
    description:
      "Generate monthly bills from tariffs and allocation records, download PDFs, review audits and track payment status.",
    residentDescription:
      "Open your internal society statement, review the solar credit and charges, and download the PDF for your records.",
  },
  {
    key: "roofmax",
    title: "RoofMax",
    subtitle: "Rooftop optimisation",
    to: "/roofmax",
    icon: Ruler,
    description:
      "Assess usable rooftop area, recommend capacity, compare scenarios and view the community financial analysis.",
  },
  {
    key: "solarvault",
    title: "SolarVault",
    subtitle: "Battery storage",
    to: "/solarvault",
    icon: BatteryCharging,
    description:
      "Size battery storage, simulate hourly dispatch, compare before/after grid import and review scenario history.",
  },
  {
    key: "apartments",
    title: "Apartment register",
    subtitle: "60-flat society",
    to: "/apartments",
    icon: Building2,
    description:
      "The seeded community apartment register: floors, categories, residents and consumption profiles.",
    adminOnly: true,
  },
];

const WORKFLOWS = {
  ADMIN: [
    {
      title: "Generate or select a SolarTwin run",
      detail: "Creates hourly solar, apartment and common-area records.",
      to: "/simulation",
    },
    {
      title: "Run a fair allocation",
      detail: "Distribute generation across flats using your chosen method.",
      to: "/allocation/run",
    },
    {
      title: "Generate monthly bills",
      detail: "Apply tariffs and society rules to the allocation records.",
      to: "/billing/generate",
    },
    {
      title: "Optimise rooftop capacity",
      detail: "Compare capacity scenarios and financial outcomes.",
      to: "/roofmax",
    },
    {
      title: "Size battery storage",
      detail: "Simulate dispatch and before/after grid import.",
      to: "/solarvault",
    },
  ],
  PERSONAL: [
    {
      title: "Review your solar allocation",
      detail: "See the daily records behind your share of society solar.",
      to: "/allocation",
      requiresApartment: true,
    },
    {
      title: "Open your monthly statement",
      detail: "Check solar credit, charges and the downloadable PDF.",
      to: "/billing/portal",
      requiresApartment: true,
    },
    {
      title: "Download your savings report",
      detail: "Export your statements and saved rooftop estimates.",
      to: "/my/reports",
    },
    {
      title: "Explore rooftop solar",
      detail: "Estimate capacity, subsidy and payback for your own roof.",
      to: "/solar-calculator",
    },
    {
      title: "Log end-of-life equipment",
      detail: "Record panel, e-waste or battery recycling.",
      to: "/circular",
    },
  ],
  DISCOM: [
    {
      title: "Inspect society generation",
      detail: "Review hourly solar, apartment demand and common-area load.",
      to: "/simulation",
    },
    {
      title: "Check rooftop optimisation",
      detail: "Review usable area and capacity recommendations.",
      to: "/roofmax",
    },
    {
      title: "Plan battery dispatch",
      detail: "Compare grid import before and after storage.",
      to: "/solarvault",
    },
    {
      title: "Monitor RPO compliance",
      detail: "Check recorded obligations and shortfall.",
      to: "/rpo",
    },
    {
      title: "Review the integration forecast",
      detail: "Compare society results with sample weather forecasts.",
      to: "/forecast",
    },
  ],
  POLICYMAKER: [
    {
      title: "Review national renewable performance",
      detail: "Capacity, generation and renewable share by source.",
      to: "/energy",
    },
    {
      title: "Inspect RPO compliance",
      detail: "Required energy, recorded compliance and shortfall.",
      to: "/rpo",
    },
    {
      title: "Check environmental impact",
      detail: "Avoided emissions and regional comparison.",
      to: "/impact",
    },
    {
      title: "Examine programme reach",
      detail: "Green job listings and applications on the platform.",
      to: "/jobs",
    },
  ],
};

const CROSS_LINKS = [
  {
    title: "Rooftop solar calculator",
    detail: "Estimate capacity, subsidy and payback for any state.",
    to: "/solar-calculator",
    icon: Calculator,
  },
  {
    title: "Forecast & storage planner",
    detail: "Compare community results against sample weather forecasts.",
    to: "/forecast",
    icon: CloudSun,
  },
  {
    title: "Green jobs & finance",
    detail: "Connect residents to skilling and financing options.",
    to: "/jobs",
    icon: Zap,
  },
  {
    title: "Green finance",
    detail: "Published loans, subsidies and market mechanisms.",
    to: "/finance",
    icon: Landmark,
  },
  {
    title: "Circular economy",
    detail: "Plan end-of-life panel and battery recycling.",
    to: "/circular",
    icon: Recycle,
  },
  {
    title: "RPO compliance tracker",
    detail: "National renewable purchase obligations and shortfall.",
    to: "/rpo",
    icon: Target,
  },
  {
    title: "Environmental impact",
    detail: "Avoided emissions and regional comparison.",
    to: "/impact",
    icon: Leaf,
  },
];

function workflowFor(role) {
  if (role === "ADMIN") return WORKFLOWS.ADMIN;
  if (role === "RESIDENT" || role === "CITIZEN") return WORKFLOWS.PERSONAL;
  return WORKFLOWS[role] || [];
}

export default function CommunityPage() {
  const { user, isAdmin } = useAuth();
  const dashboard = useApiData(getDashboardOverview, []);
  const apartments = useApiData(getApartmentSummary, []);
  const personal = user?.role === "RESIDENT" || user?.role === "CITIZEN";

  const community = dashboard.data?.community_solar || {};
  const totals = {
    apartments: apartments.data?.total_apartments ?? community.apartments,
    residents: apartments.data?.total_residents,
    runs: community.simulation_runs,
    allocations: community.allocation_runs,
    bills: community.bills,
    issued: community.bills,
  };

  const visibleModules = MODULES.filter(
    (module) =>
      (!module.adminOnly || isAdmin) && canAccessPath(user, module.to)
  );

  const workflow = workflowFor(user?.role).filter(
    (step) =>
      canAccessPath(user, step.to) &&
      (!step.requiresApartment || Boolean(user?.apartment_id))
  );

  const crossLinks = CROSS_LINKS.filter((link) => canAccessPath(user, link.to));

  if (dashboard.error) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Community solar"
          icon={Building2}
          title="Community solar hub"
        />
        <ErrorState
          title="Community data unavailable"
          message={dashboard.error}
          onRetry={dashboard.reload}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Community solar"
        icon={Building2}
        title="Community solar hub"
        description={
          personal
            ? "Your society's shared solar system: how generation is allocated, what it means for your statement, and where to plan rooftop or recycling next."
            : "The integrated 60-flat society module: simulation, fair allocation, billing, rooftop optimisation and battery storage, each scoped to your role."
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              dashboard.reload();
              apartments.reload();
            }}
            loading={dashboard.loading || apartments.loading}
          >
            <RefreshCw size={13} />
            Refresh
          </Button>
        }
      />

      <SampleNotice title={community.label || "Sample society"}>
        The community data set is a seeded sample society used to demonstrate the
        full workflow. Generation and consumption values are simulated records,
        clearly labelled throughout the module. National datasets remain separate
        and are labelled where they are sample public aggregates.
      </SampleNotice>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Apartments"
          value={formatNumber(totals.apartments, 0)}
          detail="Flats in the community register"
          icon={Building2}
          loading={apartments.loading}
        />
        <StatCard
          label="Residents"
          value={formatNumber(totals.residents, 0)}
          detail={
            apartments.data?.average_residents_per_apartment
              ? `${formatNumber(
                  apartments.data.average_residents_per_apartment,
                  1
                )} per flat on average`
              : "Registered occupants"
          }
          icon={Users}
          tone="sky"
          loading={apartments.loading}
        />
        <StatCard
          label="Simulation runs"
          value={formatNumber(totals.runs, 0)}
          detail={`${formatNumber(totals.allocations, 0)} allocation runs`}
          icon={Gauge}
          tone="emerald"
          loading={dashboard.loading}
        />
        <StatCard
          label="Bills generated"
          value={formatNumber(totals.bills, 0)}
          detail="Monthly society bills on record"
          icon={ReceiptText}
          tone="amber"
          loading={dashboard.loading}
        />
      </div>

      {visibleModules.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleModules.map((module) => {
            const Icon = module.icon;
            const description =
              personal && module.residentDescription
                ? module.residentDescription
                : module.description;
            return (
              <Card key={module.key} className="flex h-full flex-col">
                <CardBody className="flex flex-1 flex-col pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-forest-100 bg-forest-50 text-forest-700">
                      <Icon size={18} />
                    </span>
                    <Badge variant="neutral">{module.subtitle}</Badge>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-slate-900">
                    {module.title}
                  </h3>
                  <p className="mt-1.5 flex-1 text-xs leading-5 text-slate-500">
                    {description}
                  </p>
                  <Link to={module.to} className="mt-3">
                    <Button variant="outline" size="sm" className="w-full">
                      Open module
                      <ArrowRight size={13} />
                    </Button>
                  </Link>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {workflow.length > 0 && (
          <Card>
            <CardHeader
              title="Recommended workflow"
              description={
                personal
                  ? "Your route through the community solar records that belong to you."
                  : "Follow this order to explore the community solar cycle available to your role."
              }
              icon={Zap}
            />
            <CardBody>
              <ol className="space-y-2.5">
                {workflow.map((step, index) => (
                  <li key={step.title} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={step.to}
                        className="text-xs font-semibold text-slate-800 hover:text-forest-700"
                      >
                        {step.title}
                      </Link>
                      <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
                        {step.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        )}

        {crossLinks.length > 0 && (
          <Card>
            <CardHeader
              title="Related modules"
              description="Only modules your role can open are listed."
              icon={Calculator}
            />
            <CardBody>
              <div className="space-y-2">
                {crossLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 transition hover:border-forest-200 hover:bg-forest-50/40"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon
                          size={15}
                          className="shrink-0 text-forest-700"
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-slate-800">
                            {link.title}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-5 text-slate-500">
                            {link.detail}
                          </span>
                        </span>
                      </span>
                      <ArrowRight
                        size={14}
                        className="shrink-0 text-slate-400"
                      />
                    </Link>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
