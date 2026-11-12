import { Navigate, Route, Routes, useParams } from "react-router-dom";
import {
  AdminRoute,
  ProtectedRoute,
  PublicOnlyRoute,
  RoleRoute,
  WorkspaceRoute,
} from "./components/RouteGuards";
import AllocationLayout from "./components/allocation/AllocationLayout";
import BillingLayout from "./components/billing/BillingLayout";
import AppLayout from "./components/layout/AppLayout";
import RoofMaxLayout from "./components/roofmax/RoofMaxLayout";
import SimulationLayout from "./components/simulation/SimulationLayout";
import SolarVaultLayout from "./components/solarvault/SolarVaultLayout";
import { useAuth } from "./context/AuthContext";
import {
  ADMIN_ROLES,
  ALLOCATION_ROLES,
  BILLING_ROLES,
  CIRCULAR_ROLES,
  COMMUNITY_ROLES,
  DISCOM_ROLES,
  FINANCE_ROLES,
  FINANCIAL_INSTITUTION_ROLES,
  INDUSTRY_ROLES,
  JOBS_ROLES,
  LOAN_WORKFLOW_ROLES,
  NATIONAL_ANALYTICS_ROLES,
  NOTIFICATION_ROLES,
  ORGANISATION_ROLES,
  PERSONAL_ROLES,
  POLICYMAKER_ROLES,
  PROCUREMENT_ROLES,
  RECYCLER_ROLES,
  RECYCLING_WORKFLOW_ROLES,
  RENEWABLE_SUPPLIER_ROLES,
  ROOFMAX_ROLES,
  RPO_ROLES,
  SIMULATION_ROLES,
  SOLARVAULT_ROLES,
  SOLAR_CALCULATOR_ROLES,
  SOLAR_INSTALLER_ROLES,
  SOLAR_WORKFLOW_ROLES,
  COMPLIANCE_WORKFLOW_ROLES,
} from "./lib/access";
import { findModuleByKey } from "./lib/modules";
import ApartmentsPage from "./pages/ApartmentsPage";
import LoginPage from "./pages/LoginPage";
import ModulePage from "./pages/ModulePage";
import NotFoundPage from "./pages/NotFoundPage";
import RegisterPage from "./pages/RegisterPage";
import SettingsPage from "./pages/SettingsPage";
import AllocationHistoryPage from "./pages/allocation/AllocationHistoryPage";
import AllocationOverviewPage from "./pages/allocation/AllocationOverviewPage";
import ApartmentDetailsPage from "./pages/allocation/ApartmentDetailsPage";
import ComparisonDashboardPage from "./pages/allocation/ComparisonDashboardPage";
import FairnessAnalyticsPage from "./pages/allocation/FairnessAnalyticsPage";
import MethodSelectionPage from "./pages/allocation/MethodSelectionPage";
import RunAllocationPage from "./pages/allocation/RunAllocationPage";
import WhatIfSimulatorPage from "./pages/allocation/WhatIfSimulatorPage";
import ApartmentBillsPage from "./pages/billing/ApartmentBillsPage";
import BillDetailsPage from "./pages/billing/BillDetailsPage";
import BillingAuditPage from "./pages/billing/BillingAuditPage";
import BillingHistoryPage from "./pages/billing/BillingHistoryPage";
import BillingOverviewPage from "./pages/billing/BillingOverviewPage";
import GenerateBillsPage from "./pages/billing/GenerateBillsPage";
import ResidentPortalPage from "./pages/billing/ResidentPortalPage";
import DiscomDashboardPage from "./pages/discom/DiscomDashboardPage";
import DiscomReportsPage from "./pages/discom/DiscomReportsPage";
import AdminEcosystemPage from "./pages/ecosystem/AdminEcosystemPage";
import CompliancePage from "./pages/ecosystem/CompliancePage";
import InstallerDashboardPage from "./pages/ecosystem/InstallerDashboardPage";
import LoanApplicationsPage from "./pages/ecosystem/LoanApplicationsPage";
import LoansPage from "./pages/ecosystem/LoansPage";
import NotificationsPage from "./pages/ecosystem/NotificationsPage";
import OrganisationPage from "./pages/ecosystem/OrganisationPage";
import ProcurementPage from "./pages/ecosystem/ProcurementPage";
import RecyclerDashboardPage from "./pages/ecosystem/RecyclerDashboardPage";
import RecyclingRequestsPage from "./pages/ecosystem/RecyclingRequestsPage";
import SolarInstallationsPage from "./pages/ecosystem/SolarInstallationsPage";
import SolarRequestsPage from "./pages/ecosystem/SolarRequestsPage";
import SupplierDashboardPage from "./pages/ecosystem/SupplierDashboardPage";
import SupplierQuotationsPage from "./pages/ecosystem/SupplierQuotationsPage";
import FinanceDashboardPage from "./pages/finance/FinanceDashboardPage";
import IndustryDashboardPage from "./pages/industry/IndustryDashboardPage";
import PersonalDashboardPage from "./pages/personal/PersonalDashboardPage";
import HouseholdPage from "./pages/personal/HouseholdPage";
import PersonalReportsPage from "./pages/personal/PersonalReportsPage";
import AdminPortalPage from "./pages/platform/AdminPortalPage";
import CircularPage from "./pages/platform/CircularPage";
import CommunityPage from "./pages/platform/CommunityPage";
import EnergyPage from "./pages/platform/EnergyPage";
import FinancePage from "./pages/platform/FinancePage";
import ForecastPage from "./pages/platform/ForecastPage";
import ImpactPage from "./pages/platform/ImpactPage";
import JobsPage from "./pages/platform/JobsPage";
import NationalDashboardPage from "./pages/platform/NationalDashboardPage";
import RpoPage from "./pages/platform/RpoPage";
import SolarCalculatorPage from "./pages/platform/SolarCalculatorPage";
import PolicyDashboardPage from "./pages/policy/PolicyDashboardPage";
import RoofConfigurationPage from "./pages/roofmax/RoofConfigurationPage";
import RoofFinancialPage from "./pages/roofmax/RoofFinancialPage";
import RoofHistoryPage from "./pages/roofmax/RoofHistoryPage";
import RoofMaxOverviewPage from "./pages/roofmax/RoofMaxOverviewPage";
import RoofRecommendationPage from "./pages/roofmax/RoofRecommendationPage";
import RoofScenarioAnalysisPage from "./pages/roofmax/RoofScenarioAnalysisPage";
import RoofScenariosPage from "./pages/roofmax/RoofScenariosPage";
import ApartmentConsumptionPage from "./pages/simulation/ApartmentConsumptionPage";
import CommonAreaPage from "./pages/simulation/CommonAreaPage";
import EnergyFlowPage from "./pages/simulation/EnergyFlowPage";
import EnergyOverviewPage from "./pages/simulation/EnergyOverviewPage";
import SimulationControlPage from "./pages/simulation/SimulationControlPage";
import SolarAnalyticsPage from "./pages/simulation/SolarAnalyticsPage";
import BatteryComparisonPage from "./pages/solarvault/BatteryComparisonPage";
import BatteryConfigurationPage from "./pages/solarvault/BatteryConfigurationPage";
import BatteryHistoryPage from "./pages/solarvault/BatteryHistoryPage";
import BatteryOverviewPage from "./pages/solarvault/BatteryOverviewPage";
import BatteryScenarioPage from "./pages/solarvault/BatteryScenarioPage";
import EnergyFlowDashboardPage from "./pages/solarvault/EnergyFlowDashboardPage";
import HourlyDispatchPage from "./pages/solarvault/HourlyDispatchPage";

function HomeRedirect() {
  const { dashboardPath } = useAuth();
  return <Navigate to={dashboardPath} replace />;
}

function LegacyModuleRedirect() {
  const { moduleKey } = useParams();
  const module = findModuleByKey(moduleKey);
  return module ? (
    <Navigate to={module.route} replace />
  ) : (
    <NotFoundPage />
  );
}

function DashboardRedirect() {
  const { dashboardPath } = useAuth();
  return <Navigate to={dashboardPath} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route element={<WorkspaceRoute />}>
            <Route index element={<HomeRedirect />} />

            {/* ----------------------------------------- role dashboards */}
            <Route element={<RoleRoute allow={ADMIN_ROLES} />}>
              <Route path="/dashboard" element={<NationalDashboardPage />} />
            </Route>
            <Route element={<RoleRoute allow={PERSONAL_ROLES} />}>
              <Route path="/personal/dashboard" element={<PersonalDashboardPage />} />
              <Route path="/my/household" element={<HouseholdPage />} />
              <Route path="/my/reports" element={<PersonalReportsPage />} />
            </Route>
            <Route element={<RoleRoute allow={DISCOM_ROLES} />}>
              <Route path="/discom/dashboard" element={<DiscomDashboardPage />} />
              <Route path="/discom/reports" element={<DiscomReportsPage />} />
            </Route>
            <Route element={<RoleRoute allow={INDUSTRY_ROLES} />}>
              <Route path="/industry/dashboard" element={<IndustryDashboardPage />} />
            </Route>
            <Route
              element={<RoleRoute allow={FINANCIAL_INSTITUTION_ROLES} />}
            >
              <Route path="/finance/dashboard" element={<FinanceDashboardPage />} />
            </Route>
            <Route element={<RoleRoute allow={POLICYMAKER_ROLES} />}>
              <Route path="/policy/dashboard" element={<PolicyDashboardPage />} />
            </Route>
            <Route element={<RoleRoute allow={SOLAR_INSTALLER_ROLES} />}>
              <Route path="/installer/dashboard" element={<InstallerDashboardPage />} />
            </Route>
            <Route element={<RoleRoute allow={RENEWABLE_SUPPLIER_ROLES} />}>
              <Route path="/supplier/dashboard" element={<SupplierDashboardPage />} />
            </Route>
            <Route element={<RoleRoute allow={RECYCLER_ROLES} />}>
              <Route path="/recycler/dashboard" element={<RecyclerDashboardPage />} />
            </Route>

            <Route path="/admin/dashboard" element={<DashboardRedirect />} />
            <Route path="/resident/dashboard" element={<DashboardRedirect />} />

            {/* ----------------------------------- national intelligence */}
            <Route element={<RoleRoute allow={NATIONAL_ANALYTICS_ROLES} />}>
              <Route path="/energy" element={<EnergyPage />} />
              <Route path="/impact" element={<ImpactPage />} />
              <Route path="/forecast" element={<ForecastPage />} />
            </Route>
            <Route element={<RoleRoute allow={RPO_ROLES} />}>
              <Route path="/rpo" element={<RpoPage />} />
            </Route>

            {/* --------------------------------------------- opportunities */}
            <Route element={<RoleRoute allow={SOLAR_CALCULATOR_ROLES} />}>
              <Route path="/solar-calculator" element={<SolarCalculatorPage />} />
            </Route>
            <Route element={<RoleRoute allow={JOBS_ROLES} />}>
              <Route path="/jobs" element={<JobsPage />} />
            </Route>
            <Route element={<RoleRoute allow={FINANCE_ROLES} />}>
              <Route path="/finance" element={<FinancePage />} />
            </Route>
            <Route element={<RoleRoute allow={CIRCULAR_ROLES} />}>
              <Route path="/circular" element={<CircularPage />} />
            </Route>

            {/* ------------------------------------------- ecosystem workflows */}
            <Route element={<RoleRoute allow={SOLAR_WORKFLOW_ROLES} />}>
              <Route path="/solar-requests" element={<SolarRequestsPage />} />
              <Route path="/solar-installations" element={<SolarInstallationsPage />} />
            </Route>
            <Route element={<RoleRoute allow={PROCUREMENT_ROLES} />}>
              <Route path="/procurement" element={<ProcurementPage />} />
            </Route>
            <Route
              element={
                <RoleRoute allow={["ADMIN", "DISCOM", "RENEWABLE_SUPPLIER"]} />
              }
            >
              <Route
                path="/procurement/quotations"
                element={<SupplierQuotationsPage />}
              />
            </Route>
            <Route element={<RoleRoute allow={LOAN_WORKFLOW_ROLES} />}>
              <Route path="/loans" element={<LoansPage />} />
              <Route path="/loan-applications" element={<LoanApplicationsPage />} />
            </Route>
            <Route element={<RoleRoute allow={RECYCLING_WORKFLOW_ROLES} />}>
              <Route
                path="/recycling-requests"
                element={<RecyclingRequestsPage />}
              />
            </Route>
            <Route element={<RoleRoute allow={COMPLIANCE_WORKFLOW_ROLES} />}>
              <Route path="/compliance" element={<CompliancePage />} />
            </Route>
            <Route element={<RoleRoute allow={ORGANISATION_ROLES} />}>
              <Route path="/organisation" element={<OrganisationPage />} />
            </Route>
            <Route element={<RoleRoute allow={NOTIFICATION_ROLES} />}>
              <Route path="/notifications" element={<NotificationsPage />} />
            </Route>

            {/* ------------------------------------------- community solar */}
            <Route element={<RoleRoute allow={COMMUNITY_ROLES} />}>
              <Route path="/community" element={<CommunityPage />} />
            </Route>

            <Route element={<RoleRoute allow={SIMULATION_ROLES} />}>
              <Route path="/simulation" element={<SimulationLayout />}>
                <Route index element={<EnergyOverviewPage />} />
                <Route path="solar" element={<SolarAnalyticsPage />} />
                <Route path="apartments" element={<ApartmentConsumptionPage />} />
                <Route path="common" element={<CommonAreaPage />} />
                <Route path="energy-flow" element={<EnergyFlowPage />} />
                <Route element={<AdminRoute />}>
                  <Route path="control" element={<SimulationControlPage />} />
                </Route>
              </Route>
            </Route>

            <Route element={<RoleRoute allow={ALLOCATION_ROLES} />}>
              <Route path="/allocation" element={<AllocationLayout />}>
                <Route index element={<AllocationOverviewPage />} />
                <Route path="apartments" element={<ApartmentDetailsPage />} />
                <Route element={<AdminRoute />}>
                  <Route path="methods" element={<MethodSelectionPage />} />
                  <Route path="run" element={<RunAllocationPage />} />
                  <Route path="compare" element={<ComparisonDashboardPage />} />
                  <Route path="fairness" element={<FairnessAnalyticsPage />} />
                  <Route path="what-if" element={<WhatIfSimulatorPage />} />
                  <Route path="history" element={<AllocationHistoryPage />} />
                </Route>
              </Route>
            </Route>

            <Route element={<RoleRoute allow={BILLING_ROLES} />}>
              <Route path="/billing" element={<BillingLayout />}>
                <Route index element={<BillingOverviewPage />} />
                <Route path="apartments" element={<ApartmentBillsPage />} />
                <Route path="bills" element={<BillDetailsPage />} />
                <Route path="bills/:billId" element={<BillDetailsPage />} />
                <Route path="history" element={<BillingHistoryPage />} />
                <Route path="portal" element={<ResidentPortalPage />} />
                <Route element={<AdminRoute />}>
                  <Route path="generate" element={<GenerateBillsPage />} />
                  <Route path="audit" element={<BillingAuditPage />} />
                </Route>
              </Route>
            </Route>

            <Route element={<RoleRoute allow={ROOFMAX_ROLES} />}>
              <Route path="/roofmax" element={<RoofMaxLayout />}>
                <Route index element={<RoofMaxOverviewPage />} />
                <Route path="recommendation" element={<RoofRecommendationPage />} />
                <Route path="scenarios" element={<RoofScenariosPage />} />
                <Route path="financial" element={<RoofFinancialPage />} />
                <Route
                  path="scenario-analysis"
                  element={<RoofScenarioAnalysisPage />}
                />
                <Route path="history" element={<RoofHistoryPage />} />
                <Route element={<AdminRoute />}>
                  <Route path="configuration" element={<RoofConfigurationPage />} />
                </Route>
              </Route>
            </Route>

            <Route element={<RoleRoute allow={SOLARVAULT_ROLES} />}>
              <Route path="/solarvault" element={<SolarVaultLayout />}>
                <Route index element={<BatteryOverviewPage />} />
                <Route path="hourly" element={<HourlyDispatchPage />} />
                <Route path="energy-flow" element={<EnergyFlowDashboardPage />} />
                <Route path="comparison" element={<BatteryComparisonPage />} />
                <Route path="history" element={<BatteryHistoryPage />} />
                <Route element={<AdminRoute />}>
                  <Route path="configuration" element={<BatteryConfigurationPage />} />
                  <Route path="scenario" element={<BatteryScenarioPage />} />
                </Route>
              </Route>
            </Route>

            {/* ------------------------------------------- administration */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminPortalPage />} />
              <Route path="/admin/ecosystem" element={<AdminEcosystemPage />} />
              <Route path="/apartments" element={<ApartmentsPage />} />
              <Route path="/meterguard" element={<ModulePage />} />
            </Route>

            <Route path="/settings" element={<SettingsPage />} />

            <Route path="/modules/:moduleKey" element={<LegacyModuleRedirect />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
