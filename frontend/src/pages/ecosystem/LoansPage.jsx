import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeIndianRupee,
  CheckCircle2,
  HandCoins,
  Landmark,
  Pencil,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import Modal from "../../components/platform/Modal";
import { StatusBadge } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import { Field, NoteBanner } from "../../components/ecosystem/EcosystemKit";
import { useAuth } from "../../context/AuthContext";
import useApiData from "../../hooks/useApiData";
import { INDIAN_STATES, titleCaseToken } from "../../lib/constants";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import {
  createLoanApplication,
  createLoanProduct,
  getLoanProducts,
  updateLoanProduct,
} from "../../services/ecosystemService";

const EMPTY_PRODUCT = {
  name: "",
  description: "",
  interest_rate_min: "",
  interest_rate_max: "",
  min_amount: "",
  max_amount: "",
  tenure_months_min: 12,
  tenure_months_max: 60,
  eligibility: "",
  required_documents: "",
  processing_fee_pct: "",
  is_active: false,
};

function productToForm(product) {
  return {
    name: product.name || "",
    description: product.description || "",
    interest_rate_min: product.interest_rate_min ?? "",
    interest_rate_max: product.interest_rate_max ?? "",
    min_amount: product.min_amount ?? "",
    max_amount: product.max_amount ?? "",
    tenure_months_min: product.tenure_months_min ?? 12,
    tenure_months_max: product.tenure_months_max ?? 60,
    eligibility: product.eligibility || "",
    required_documents: (product.required_documents || []).join(", "),
    processing_fee_pct: product.processing_fee_pct ?? "",
    is_active: Boolean(product.is_active),
  };
}

export default function LoansPage() {
  const { user } = useAuth();
  const role = user?.role;
  const isInstitution = role === "FINANCIAL_INSTITUTION";
  const isAdmin = role === "ADMIN";
  const canManage = isInstitution || isAdmin;
  const canEdit = isInstitution;
  const canApply = ["CITIZEN", "RESIDENT", "INDUSTRY"].includes(role);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [productOpen, setProductOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [applyProduct, setApplyProduct] = useState(null);
  const [application, setApplication] = useState({
    loan_amount: "",
    project_purpose: "",
    location: "",
    state: user?.state || "",
  });
  const [applyError, setApplyError] = useState("");
  const [success, setSuccess] = useState("");

  const products = useApiData(
    () =>
      getLoanProducts({
        mine: canManage,
        activeOnly: canManage ? false : true,
        search,
        page,
        pageSize: 12,
      }),
    [canManage, search, page]
  );

  const items = products.data?.items || [];

  const summary = useMemo(() => {
    if (!canManage) return null;
    return {
      total: products.data?.total || items.length,
      active: items.filter((product) => product.is_active).length,
      averageRate:
        items.length > 0
          ? items.reduce(
              (sum, product) =>
                sum + (Number(product.interest_rate_min) + Number(product.interest_rate_max)) / 2,
              0
            ) / items.length
          : 0,
    };
  }, [canManage, items, products.data]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_PRODUCT);
    setFormError("");
    setProductOpen(true);
  }

  function openEdit(product) {
    setEditing(product);
    setForm(productToForm(product));
    setFormError("");
    setProductOpen(true);
  }

  function submitSearch(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  async function submitProduct(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const payload = {
      name: form.name,
      description: form.description,
      interest_rate_min: Number(form.interest_rate_min),
      interest_rate_max: Number(form.interest_rate_max),
      min_amount: Number(form.min_amount),
      max_amount: Number(form.max_amount),
      tenure_months_min: Number(form.tenure_months_min),
      tenure_months_max: Number(form.tenure_months_max),
      eligibility: form.eligibility,
      required_documents: form.required_documents
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      processing_fee_pct: Number(form.processing_fee_pct || 0),
      is_active: Boolean(form.is_active),
    };
    try {
      if (editing) {
        await updateLoanProduct(editing.id, payload);
      } else {
        await createLoanProduct(payload);
      }
      setProductOpen(false);
      setForm(EMPTY_PRODUCT);
      setEditing(null);
      products.reload();
    } catch (error) {
      setFormError(error?.message || "The loan product could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product) {
    try {
      await updateLoanProduct(product.id, { is_active: !product.is_active });
      products.reload();
    } catch (error) {
      setFormError(error?.message || "The loan product could not be updated.");
    }
  }

  function openApply(product) {
    setApplyProduct(product);
    setApplication({
      loan_amount: "",
      project_purpose: "",
      location: "",
      state: user?.state || "",
    });
    setApplyError("");
    setSuccess("");
  }

  async function submitApplication(event) {
    event.preventDefault();
    setSaving(true);
    setApplyError("");
    try {
      const created = await createLoanApplication({
        product_id: applyProduct.id,
        loan_amount: Number(application.loan_amount),
        project_purpose: application.project_purpose,
        location: application.location,
        state: application.state,
      });
      setApplyProduct(null);
      setSuccess(
        `Application ${created.reference} submitted to ${
          created.institution?.name || "the institution"
        }. Track the decision in My loan applications.`
      );
    } catch (error) {
      setApplyError(error?.message || "The application could not be submitted.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow C · green finance"
        icon={HandCoins}
        title={canManage ? "Green loan products" : "Green loan marketplace"}
        description={
          isInstitution
            ? "Publish rooftop solar loan products with transparent rates, tenure and document requirements."
            : isAdmin
              ? "Oversight of green loan products published by verified financial institutions."
              : "Compare verified green loan products and apply directly to the lending institution."
        }
        actions={
          <>
            {canEdit && (
              <Button size="sm" onClick={openCreate}>
                <Plus size={13} /> New product
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={products.reload}
              loading={products.loading}
            >
              <RefreshCw size={13} /> Refresh
            </Button>
          </>
        }
      />

      {success && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-[11px] text-emerald-900">
          <p className="inline-flex items-center gap-2">
            <CheckCircle2 size={15} /> {success}
          </p>
          <Link to="/loan-applications">
            <Button size="sm" variant="outline">
              Track application
            </Button>
          </Link>
        </div>
      )}

      {canManage && summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
              Products
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {formatNumber(summary.total, 0)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
              Active on marketplace
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {formatNumber(summary.active, 0)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
              Average rate (page)
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {formatPercent(summary.averageRate, 2)}
            </p>
          </div>
        </div>
      )}

      {!canManage && (
        <NoteBanner title="Verified lenders only">
          Only loan products from verified financial institutions appear in the
          marketplace. Applications are shared with the selected lender and stored in
          your account.
        </NoteBanner>
      )}

      <Card>
        <CardBody>
          <form className="flex flex-wrap items-center gap-2" onSubmit={submitSearch}>
            <div className="relative min-w-[240px] flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                className="field h-9 pl-9 text-xs"
                placeholder="Search product, eligibility or purpose…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label="Search loan products"
              />
            </div>
            <Button type="submit" size="sm" variant="outline">
              Search
            </Button>
            {canManage && (
              <Badge variant="neutral">{formatNumber(products.data?.total, 0)} products</Badge>
            )}
          </form>
        </CardBody>
      </Card>

      {products.error ? (
        <ErrorState
          title="Loan products unavailable"
          message={products.error}
          onRetry={products.reload}
        />
      ) : products.loading && !products.data ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-56 animate-pulse rounded-xl bg-white shadow-card" />
          ))}
        </div>
      ) : items.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((product) => (
            <Card key={product.id} className="h-full">
              <CardHeader
                title={product.name}
                description={
                  product.organisation_name ||
                  product.institution?.organization ||
                  product.institution?.name ||
                  "Financial institution"
                }
                icon={Landmark}
                action={<StatusBadge value={product.status} />}
              />
              <CardBody className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                    <p className="text-slate-500">Interest</p>
                    <p className="font-semibold text-slate-800">
                      {formatPercent(product.interest_rate_min, 1)}–
                      {formatPercent(product.interest_rate_max, 1)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                    <p className="text-slate-500">Tenure</p>
                    <p className="font-semibold text-slate-800">
                      {product.tenure_months_min}–{product.tenure_months_max} mo
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                    <p className="text-slate-500">Fee</p>
                    <p className="font-semibold text-slate-800">
                      {formatPercent(product.processing_fee_pct, 1)}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] leading-5 text-slate-600">
                  {product.description || "No product description provided."}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                  <p className="text-[10px] text-slate-500">
                    {formatCurrency(product.min_amount)} –{" "}
                    {formatCurrency(product.max_amount)}
                  </p>
                  <div className="flex gap-1.5">
                    {canEdit ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(product)}
                        >
                          <Pencil size={12} /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant={product.is_active ? "ghost" : "secondary"}
                          onClick={() => toggleActive(product)}
                        >
                          {product.is_active ? "Deactivate" : "Publish"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Link to="/loan-applications">
                          <Button size="sm" variant="ghost">
                            {isAdmin ? "Applications" : "My applications"}
                          </Button>
                        </Link>
                        {canApply && (
                          <Button size="sm" onClick={() => openApply(product)}>
                            <BadgeIndianRupee size={13} /> Apply
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={HandCoins}
          title="No loan products"
          description={
            canEdit
              ? "Create your first green loan product and publish it to the marketplace."
              : isAdmin
                ? "No loan products have been published by financial institutions yet."
                : "Verified lenders have not published products yet. Check back soon."
          }
          action={
            canEdit ? (
              <Button size="sm" onClick={openCreate}>
                <Plus size={13} /> Create product
              </Button>
            ) : null
          }
        />
      )}

      <Modal
        open={productOpen}
        onClose={() => setProductOpen(false)}
        title={editing ? "Edit loan product" : "New green loan product"}
        description="Only products marked active are visible in the citizen marketplace."
        wide
      >
        <form className="space-y-3" onSubmit={submitProduct}>
          <Field label="Product name">
            <input
              className="field mt-1 h-9 w-full text-xs"
              required
              minLength={3}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Description">
            <textarea
              className="field mt-1 min-h-[80px] w-full text-xs"
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Minimum interest rate (%)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={form.interest_rate_min}
                onChange={(event) =>
                  setForm({ ...form, interest_rate_min: event.target.value })
                }
              />
            </Field>
            <Field label="Maximum interest rate (%)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={form.interest_rate_max}
                onChange={(event) =>
                  setForm({ ...form, interest_rate_max: event.target.value })
                }
              />
            </Field>
            <Field label="Minimum amount (INR)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="1"
                required
                value={form.min_amount}
                onChange={(event) =>
                  setForm({ ...form, min_amount: event.target.value })
                }
              />
            </Field>
            <Field label="Maximum amount (INR)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="1"
                required
                value={form.max_amount}
                onChange={(event) =>
                  setForm({ ...form, max_amount: event.target.value })
                }
              />
            </Field>
            <Field label="Minimum tenure (months)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="1"
                max="600"
                value={form.tenure_months_min}
                onChange={(event) =>
                  setForm({ ...form, tenure_months_min: event.target.value })
                }
              />
            </Field>
            <Field label="Maximum tenure (months)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="1"
                max="600"
                value={form.tenure_months_max}
                onChange={(event) =>
                  setForm({ ...form, tenure_months_max: event.target.value })
                }
              />
            </Field>
            <Field label="Processing fee (%)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.processing_fee_pct}
                onChange={(event) =>
                  setForm({ ...form, processing_fee_pct: event.target.value })
                }
              />
            </Field>
            <Field label="Publish to marketplace">
              <label className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) =>
                    setForm({ ...form, is_active: event.target.checked })
                  }
                />
                Active and visible to applicants
              </label>
            </Field>
          </div>
          <Field label="Eligibility criteria">
            <textarea
              className="field mt-1 min-h-[80px] w-full text-xs"
              value={form.eligibility}
              onChange={(event) =>
                setForm({ ...form, eligibility: event.target.value })
              }
            />
          </Field>
          <Field
            label="Required documents"
            hint="Separate each document with a comma."
          >
            <input
              className="field mt-1 h-9 w-full text-xs"
              value={form.required_documents}
              onChange={(event) =>
                setForm({ ...form, required_documents: event.target.value })
              }
              placeholder="PAN, Aadhaar, Electricity bill, Quotation"
            />
          </Field>
          {formError && <NoteBanner tone="danger">{formError}</NoteBanner>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setProductOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              {editing ? "Save changes" : "Create product"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(applyProduct)}
        onClose={() => setApplyProduct(null)}
        title="Apply for a green loan"
        description={
          applyProduct
            ? `${applyProduct.name} · ${formatCurrency(
                applyProduct.min_amount
              )}–${formatCurrency(applyProduct.max_amount)}`
            : ""
        }
      >
        <form className="space-y-3" onSubmit={submitApplication}>
          <Field label="Loan amount (INR)">
            <input
              className="field mt-1 h-9 w-full text-xs"
              type="number"
              min="1"
              required
              value={application.loan_amount}
              onChange={(event) =>
                setApplication({ ...application, loan_amount: event.target.value })
              }
            />
          </Field>
          <Field label="Project purpose">
            <input
              className="field mt-1 h-9 w-full text-xs"
              required
              minLength={3}
              value={application.project_purpose}
              onChange={(event) =>
                setApplication({
                  ...application,
                  project_purpose: event.target.value,
                })
              }
              placeholder="Rooftop solar installation, battery storage…"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project location">
              <input
                className="field mt-1 h-9 w-full text-xs"
                value={application.location}
                onChange={(event) =>
                  setApplication({ ...application, location: event.target.value })
                }
              />
            </Field>
            <Field label="State">
              <select
                className="field mt-1 h-9 w-full text-xs"
                value={application.state}
                onChange={(event) =>
                  setApplication({ ...application, state: event.target.value })
                }
              >
                <option value="">Select state</option>
                {INDIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <NoteBanner tone="info">
            Required documents: {(applyProduct?.required_documents || []).join(", ") ||
              "Supporting documents can be uploaded after submitting."}
          </NoteBanner>
          {applyError && <NoteBanner tone="danger">{applyError}</NoteBanner>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setApplyProduct(null)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              Submit application
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
