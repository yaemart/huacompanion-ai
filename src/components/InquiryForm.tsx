"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { services } from "@/lib/content";
import { catalogCities } from "@/lib/catalog-options";
import { locales, localeNames, type Locale } from "@/lib/locales";
import { formText, type FormCopyKey } from "@/lib/form-copy";
import {
  validateStep,
  errorStep,
  visibleReviewValues,
  type Values,
  type FormKind,
} from "@/lib/forms";
import { Icon } from "./Icon";
export type CatalogSelection = {
  source?: import("@/lib/catalog").CatalogSource;
  summary?: string;
  city?: string;
  error?: string;
};
export function InquiryForm({
  locale,
  kind,
  initialService,
  catalogSelection,
}: {
  locale: Locale;
  kind: FormKind;
  initialService?: string;
  catalogSelection?: CatalogSelection;
}) {
  const localMode = process.env.NEXT_PUBLIC_FORM_MODE === "local";
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [saveError, setSaveError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const request = useRef<{ key: string; body: string } | null>(null);
  const c = (key: FormCopyKey, _chinese?: string) => formText(locale, key);
  const partner = kind === "apply";
  const [step, setStep] = useState(0),
    [values, setValues] = useState<Values>({
      categories: services.some((s) => s.slug === initialService)
        ? [initialService!]
        : [],
      city: catalogSelection?.city || "",
      stayType: "short",
      datesUnknown: false,
      language: localeNames[locale],
      people: "1",
      channel: "email",
    }),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [checked, setChecked] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const labels: Record<string, string> = {
    organisation: c("Organisation name", "机构名称"),
    city: partner
      ? c("Service areas", "服务区域")
      : c("Preferred city", "希望服务的城市"),
    people: c("Number of people", "人数"),
    arrivalDate: c("Expected arrival date", "预计来华日期"),
    industry: c("Industry / products", "行业／产品"),
    purpose: c("Exhibition or visit purpose", "展会或访问目的"),
    flight: c("Flight / train details", "航班／车次"),
    pickup: c("Pickup location", "上车地点"),
    dropoff: c("Drop-off location", "下车地点"),
    luggage: c("Luggage / vehicle needs", "行李／用车需求"),
    checkIn: c("Check-in date", "入住日期"),
    checkOut: c("Check-out date", "退房日期"),
    area: c("Preferred area", "偏好区域"),
    facilities: c("Room type and facilities", "房型与设施"),
    leaseLength: c("Expected lease duration", "预计租期"),
    rentalNeeds: c("Lease and move-in needs", "租赁与入住需求"),
    destinations: c("Destinations", "目的地"),
    interests: c("Interests and travelling companions", "兴趣与同行情况"),
    interpretation: c("Language pair and setting", "翻译语言与场景"),
    arrivalHelp: c("Everyday support needed", "需要的生活协助"),
    medicalHelp: c(
      "Coordination needed (no medical history)",
      "协调需求（请勿填写病史）",
    ),
    budget: c("Budget range and currency (optional)", "预算范围与币种（可选）"),
    description: c("Anything else to help us understand?", "其他需求说明"),
    name: c("Contact name", "联系人姓名"),
    email: c("Email", "电子邮箱"),
    phone: c("Phone", "电话"),
    contact: c("Additional contact details (optional)", "其他联系方式（可选）"),
    language: c("Communication language", "沟通语言"),
    website: c("Website or public introduction", "官网或公开介绍链接"),
    languages: c("Supported languages", "支持语言"),
    capabilities: c("Service capabilities", "服务能力"),
    hours: c("Operating hours", "营业时段"),
    cooperation: c("Preferred cooperation arrangements", "合作方式"),
    qualification: c(
      "Qualification type and number (if relevant)",
      "资质类型与编号（如适用）",
    ),
    notes: c("Additional notes", "补充说明"),
  };
  const set = (key: string, value: string | boolean | string[]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
    setChecked(false);
  };
  const val = (key: string) =>
    typeof values[key] === "string" ? (values[key] as string) : "";
  const field = (key: string, type = "text", required = false) => (
    <div className={`field ${type === "textarea" ? "full" : ""}`} key={key}>
      <label htmlFor={key}>
        {labels[key]}
        {required && <span className="required"> *</span>}
      </label>
      {key === "city" && !partner ? (
        <select
          id="city"
          value={val("city")}
          onChange={(e) => set("city", e.target.value)}
          aria-required="true"
          aria-invalid={!!errors.city}
          aria-describedby={errors.city ? "city-error" : undefined}
        >
          <option value="">— {labels.city} —</option>
          {catalogCities.map(city => <option key={city.code} value={city.en}>{city[locale]}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea
          id={key}
          value={val(key)}
          onChange={(e) => set(key, e.target.value)}
          rows={3}
          maxLength={2000}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `${key}-error` : undefined}
        />
      ) : (
        <input
          id={key}
          type={type}
          value={val(key)}
          onChange={(e) => set(key, e.target.value)}
          maxLength={key === "email" ? 254 : 300}
          min={type === "number" ? 1 : undefined}
          step={type === "number" ? 1 : undefined}
          autoComplete={["name", "email"].includes(key) ? key : undefined}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `${key}-error` : undefined}
        />
      )}{" "}
      {errors[key] && (
        <span className="field-error" id={`${key}-error`}>
          {errors[key]}
        </span>
      )}
    </div>
  );
  const categories = values.categories as string[];
  const steps = partner
    ? [
        c("Organisation", "机构信息"),
        c("Capabilities", "服务能力"),
        c("Contact", "联系方式"),
        c("Review", "核对信息"),
      ]
    : [
        c("Your needs", "服务需求"),
        c("Visit details", "行程细节"),
        c("Stay in touch", "联系方式"),
        c("Review", "核对信息"),
      ];
  const move = (n: number) => {
    setStep(n);
    setErrors({});
    setChecked(false);
    setTimeout(() => heading.current?.focus(), 0);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (catalogSelection?.error) {
      setSaveError(catalogSelection.error);
      return;
    }
    const found = validateStep(kind, step, values, locale);
    setErrors(found);
    if (Object.keys(found).length) {
      setTimeout(
        () =>
          document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        0,
      );
      return;
    }
    if (step < 3) move(step + 1);
    else if (!localMode) setChecked(true);
    else {
      if (saving || receipt) return;
      request.current ??= {
        key: crypto.randomUUID(),
        body: JSON.stringify({
          kind,
          locale,
          values,
          ...(catalogSelection?.source
            ? { source: catalogSelection.source }
            : {}),
        }),
      };
      setSaving(true);
      setSaveError("");
      setAttempted(true);
      try {
        const response = await fetch("/api/intake", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": request.current.key,
          },
          body: request.current.body,
        });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 400) {
            request.current = null;
            setAttempted(false);
            setErrors(result.fields || {});
            setStep(errorStep(kind, result.fields || {}));
            setTimeout(() => heading.current?.focus(), 0);
          }
          if (result.fields?.source) throw new Error(result.fields.source);
          throw new Error(
            c(
              "Saving could not be confirmed. Retry with the same information, or go back to correct highlighted fields.",
              "暂时无法确认保存。可重试原提交，或返回修改提示字段。",
            ),
          );
        }
        if (typeof result.reference !== "string")
          throw new Error(
            c("No receipt received. Please retry.", "未收到编号，请重试。"),
          );
        setReceipt(result.reference);
      } catch (error) {
        setSaveError(
          error instanceof Error && error.name === "Error"
            ? error.message
            : c("Unable to confirm saving. Please retry."),
        );
      } finally {
        setSaving(false);
      }
    }
  };
  const section = (title: string, children: React.ReactNode) => (
    <fieldset className="form-section">
      <legend>{title}</legend>
      <div className="fields">{children}</div>
    </fieldset>
  );
  return (
    <section className="form-page">
      <div className="form-intro">
        <span className="eyebrow">
          {partner
            ? c("BECOME A PARTNER", "申请合作")
            : c("LET’S PLAN YOUR VISIT", "整理您的来华需求")}
        </span>
        <h1>
          {partner
            ? c(
                "Good work starts with a connection.",
                "好的合作，始于相互了解。",
              )
            : c("Tell us about your plans.", "从您的计划说起。")}
        </h1>
        <p>
          {partner
            ? c(
                "Introduce your organisation and the services you can deliver. Applications are reviewed before any partnership is confirmed.",
                "介绍您的机构与服务能力。申请经审核后再确认合作，不自动公开展示。",
              )
            : c(
                "A few details help us understand what you need. You do not need to have everything decided.",
                "一些初步信息，帮助我们理解您的需要。不必提前确定所有细节。",
              )}
        </p>
        <div className="form-reassurance">
          <Icon name="leaf" />
          <p>
            {c(
              "Clear scope. Thoughtful coordination. Your plans, at your pace.",
              "清楚的范围，用心的协调。按您的节奏，一步步安排。",
            )}
          </p>
        </div>
        <div className="form-preview-note">
          {c(
            localMode
              ? "LOCAL TESTING: fictional details only. Submissions are saved in the local test database; no email is sent."
              : "Preview only: please use fictional details. Nothing entered here is submitted or saved.",
            localMode
              ? "本地测试：请仅用虚构资料。提交后会保存到本地测试数据库，暂不发送邮件。"
              : "仅供预览：请使用虚构测试资料。这里填写的信息不会提交或保存。",
          )}
        </div>
        <Link
          className="text-link"
          href={`/${locale}/${partner ? "partners" : "services"}`}
        >
          ←{" "}
          {partner
            ? c("About collaboration", "了解合作")
            : c("Explore services", "了解服务")}
        </Link>
      </div>
      <div className="form-panel">
        <ol className="form-steps">
          {steps.map((s, i) => (
            <li
              key={i}
              className={step === i ? "current" : step > i ? "done" : ""}
              aria-current={step === i ? "step" : undefined}
            >
              <span>{step > i ? "✓" : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        {catalogSelection && (
          <div
            className="notice"
            role={catalogSelection.error ? "alert" : "status"}
            style={{
              padding: 20,
              border: "1px solid #9aafa5",
              marginBottom: 20,
            }}
          >
            <strong>{c("Selected service", "所选服务")}</strong>
            <p>{catalogSelection.error || catalogSelection.summary}</p>
            <p>
              {c(
                "Hua handles the enquiry. Availability and price require confirmation.",
                "由华伴统一承接咨询，档期和价格需另行确认。",
              )}
            </p>
            <Link href={`/${locale}/request`}>
              {c(
                "Remove selection and start a general enquiry",
                "移除选择，重新填写一般咨询",
              )}
            </Link>
          </div>
        )}
        <form onSubmit={submit} noValidate>
          <fieldset
            className="form-body"
            disabled={
              saving || !!receipt || attempted || !!catalogSelection?.error
            }
          >
            <div className="form-heading">
              <span className="eyebrow">
                {c("STEP", "步骤")} {step + 1} / 4
              </span>
              <h2 ref={heading} tabIndex={-1}>
                {steps[step]}
              </h2>
              <p>{c("Fields marked * are required.", "标有 * 的为必填项。")}</p>
            </div>
            {step === 0 && (
              <>
                {partner && field("organisation", "text", true)}
                <fieldset className="category-field">
                  <legend>
                    {c(
                      "How can we help? Select all that apply.",
                      "服务类别（可多选）",
                    )}{" "}
                    *
                  </legend>
                  <div className="category-grid">
                    {services.map((s) => (
                      <label
                        key={s.slug}
                        className={categories.includes(s.slug) ? "chosen" : ""}
                      >
                        <input
                          type="checkbox"
                          checked={categories.includes(s.slug)}
                          onChange={() =>
                            set(
                              "categories",
                              categories.includes(s.slug)
                                ? categories.filter((x) => x !== s.slug)
                                : [...categories, s.slug],
                            )
                          }
                        />
                        <Icon name={s.icon} size={22} />
                        <span>{s.title[locale]}</span>
                      </label>
                    ))}
                  </div>
                  {errors.categories && (
                    <p role="alert" className="field-error">
                      {errors.categories}
                    </p>
                  )}
                </fieldset>
                {field("city", "text", true)}
                <p className="helper">
                  {partner
                    ? c(
                        "List the cities or regions where you can actually deliver services.",
                        "请填写能够实际提供服务的城市或区域。",
                      )
                    : c(
                        "Our initial base is Shanghai. Other cities depend on confirmed resources.",
                        "初期以上海为基地，其他城市根据可确认资源安排。",
                      )}
                </p>
              </>
            )}
            {step === 1 && !partner && (
              <>
                {section(
                  c("Travel basics", "基本行程"),
                  <>
                    {field("people", "number", true)}
                    <div className="field">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={!!values.datesUnknown}
                          onChange={(e) =>
                            set("datesUnknown", e.target.checked)
                          }
                        />
                        {c("Dates not decided yet", "日期尚未确定")}
                      </label>
                    </div>
                    {!values.datesUnknown && field("arrivalDate", "date", true)}
                    {field("budget")}
                  </>,
                )}
                {categories.includes("business") &&
                  section(
                    c("Business visit", "商务访问"),
                    <>
                      {field("industry")}
                      {field("purpose", "textarea")}
                    </>,
                  )}
                {categories.includes("transport") &&
                  section(
                    c("Transport", "交通安排"),
                    <>
                      {field("flight")}
                      {field("luggage")}
                      {field("pickup")}
                      {field("dropoff")}
                    </>,
                  )}
                {categories.includes("stays") &&
                  section(
                    c("Accommodation", "住宿安排"),
                    <>
                      <div className="field full">
                        <label htmlFor="stayType">
                          {c("Stay type", "住宿类型")}
                        </label>
                        <select
                          id="stayType"
                          value={val("stayType")}
                          onChange={(e) => set("stayType", e.target.value)}
                        >
                          <option value="short">
                            {c("Hotel / short stay", "酒店／短住")}
                          </option>
                          <option value="long">
                            {c("Long-term rental", "长期租赁")}
                          </option>
                        </select>
                      </div>
                      {values.stayType === "long" ? (
                        <>
                          {field("leaseLength", "text", true)}
                          {field("rentalNeeds", "textarea")}
                          <p className="helper full">
                            {c(
                              "Deposit, lease term, service fees and move-out conditions need separate confirmation.",
                              "押金、租期、服务费及退租条件需单独确认。",
                            )}
                          </p>
                        </>
                      ) : (
                        <>
                          {field("checkIn", "date")}
                          {field("checkOut", "date")}
                        </>
                      )}
                      {field("area")}
                      {field("facilities")}
                    </>,
                  )}
                {categories.includes("travel") &&
                  section(
                    c("Travel interests", "旅行偏好"),
                    <>
                      {field("destinations")}
                      {field("interests", "textarea")}
                    </>,
                  )}
                {categories.includes("interpretation") &&
                  field("interpretation", "textarea")}
                {categories.includes("arrival") &&
                  field("arrivalHelp", "textarea")}
                {categories.includes("medical") && (
                  <div className="notice compact">
                    {c(
                      "Do not include detailed medical history, records or identification numbers. Only describe the type of coordination needed.",
                      "请勿填写详细病史、病历或证件号码，仅说明所需协调类型。",
                    )}
                    {field("medicalHelp", "textarea")}
                  </div>
                )}
                {field("description", "textarea")}
              </>
            )}
            {step === 1 && partner && (
              <>
                {field("languages", "text", true)}
                {field("capabilities", "textarea", true)}
                {field("hours")}
                {field("cooperation", "textarea")}
                {field("qualification")}
                {field("notes", "textarea")}
                <p className="helper">
                  {c(
                    "Do not upload certificates here. Any required documents will be requested through a controlled follow-up process.",
                    "此处不上传证件。所需材料将通过后续受控流程收集。",
                  )}
                </p>
              </>
            )}
            {step === 2 && (
              <>
                <div className="fields">
                  {field("name", "text", true)}
                  {field("email", "email", true)}
                  {partner ? (
                    <>
                      {field("phone", "tel", true)}
                      {field("website", "url")}
                    </>
                  ) : (
                    <>
                      <div className="field">
                        <label htmlFor="language">{labels.language}<span className="required"> *</span></label>
                        <select id="language" value={val("language")} onChange={(e) => set("language", e.target.value)} aria-invalid={!!errors.language} aria-describedby={errors.language ? "language-error" : undefined}>
                          {locales.map((code) => <option key={code} value={localeNames[code]} lang={code}>{localeNames[code]}</option>)}
                        </select>
                        {errors.language && <span className="field-error" id="language-error">{errors.language}</span>}
                      </div>
                      <div className="field">
                        <label htmlFor="channel">
                          {c("Preferred contact channel", "首选联系渠道")}
                        </label>
                        <select
                          id="channel"
                          value={val("channel")}
                          onChange={(e) => set("channel", e.target.value)}
                        >
                          <option value="email">{c("Email")}</option>
                          <option value="phone">{c("Phone", "电话")}</option>
                          <option value="wechat">WeChat</option>
                          <option value="whatsapp">WhatsApp</option>
                        </select>
                      </div>
                      {field("contact")}
                    </>
                  )}
                </div>
                <p className="helper">
                  {c(
                    "Please do not include passwords, verification codes or identity document numbers.",
                    "请勿填写密码、验证码或证件号码。",
                  )}
                </p>
              </>
            )}
            {step === 3 && (
              <>
                <div className="review-summary">
                  <h3>{c("Your information", "您填写的信息")}</h3>
                  <dl>
                    <dt>{c("Services", "服务类别")}</dt>
                    <dd>
                      {categories
                        .map(
                          (s) =>
                            services.find((x) => x.slug === s)?.title[locale],
                        )
                        .join(" · ")}
                    </dd>
                    {Object.entries(visibleReviewValues(values))
                      .filter(
                        ([k, v]) =>
                          labels[k] &&
                          typeof v === "string" &&
                          v &&
                          !(k === "arrivalDate" && values.datesUnknown) &&
                          !(
                            values.stayType === "long" &&
                            ["checkIn", "checkOut"].includes(k)
                          ) &&
                          !(
                            values.stayType === "short" &&
                            ["leaseLength", "rentalNeeds"].includes(k)
                          ),
                      )
                      .map(([k, v]) => (
                        <div className="review-row" key={k}>
                          <dt>{labels[k]}</dt>
                          <dd>{k === "city" && !partner ? catalogCities.find(city => city.en === v)?.[locale] || String(v) : String(v)}</dd>
                        </div>
                      ))}
                    {values.datesUnknown && (
                      <>
                        <dt>{c("Arrival", "抵达日期")}</dt>
                        <dd>{c("Not decided yet", "尚未确定")}</dd>
                      </>
                    )}
                  </dl>
                </div>
                <label className="checkbox-label consent">
                  <input
                    type="checkbox"
                    checked={!!values.consent}
                    onChange={(e) => set("consent", e.target.checked)}
                    aria-invalid={!!errors.consent}
                  />
                  <span>
                    {c("I have read the ", "我已阅读")}
                    <Link href={`/${locale}/privacy`} target="_blank">
                      {c("privacy notice", "隐私说明")}
                    </Link>
                    {c(
                      localMode
                        ? " and agree to save this fictional submission in the local test database."
                        : " and understand this preview does not send or save my information.",
                      localMode
                        ? "，并同意将本次虚构测试信息保存到本地测试数据库。"
                        : "，并了解本预览不会发送或保存我的信息。",
                    )}
                  </span>
                </label>
                {errors.consent && (
                  <p role="alert" className="field-error">
                    {errors.consent}
                  </p>
                )}
                {checked && (
                  <div role="status" className="preview-result">
                    <b>
                      {c(
                        "Preview check complete — nothing submitted.",
                        "预览检查完成 — 未提交任何信息。",
                      )}
                    </b>
                    <p>
                      {c(
                        "Your entries passed this preview’s checks. The database and notification service are not connected, so no enquiry or application has been created.",
                        "填写内容已通过本预览的检查。数据库与通知服务尚未接通，没有生成咨询或合作申请。",
                      )}
                    </p>
                  </div>
                )}
              </>
            )}
            {Object.keys(errors).length > 0 && (
              <p role="alert" className="error-summary">
                {c(
                  "Please check the highlighted fields before continuing.",
                  "请检查提示的字段，再继续。",
                )}
              </p>
            )}
          </fieldset>
          {receipt && (
            <div className="preview-result" role="status">
              <b>
                {c(
                  "Saved to the local test database.",
                  "已保存到本地测试数据库。",
                )}
              </b>
              <p>
                {c("Reference: ", "编号：")}
                {receipt}
              </p>
              <p>
                {c(
                  "Email is not configured. No confirmation email has been sent.",
                  "邮件服务尚未配置，未发送确认邮件。",
                )}
              </p>
            </div>
          )}
          {saveError && (
            <p role="alert" className="error-summary">
              {saveError}
            </p>
          )}
          <div className="form-navigation">
            {step > 0 ? (
              <button
                disabled={
                  saving || !!receipt || attempted || !!catalogSelection?.error
                }
                className="back-button"
                type="button"
                onClick={() => move(step - 1)}
              >
                ← {c("Back", "上一步")}
              </button>
            ) : (
              <span />
            )}
            <button
              className="button"
              type="submit"
              disabled={saving || !!receipt}
            >
              {step === 3
                ? saving
                  ? c("Saving…", "保存中…")
                  : receipt
                    ? c("Saved", "已保存")
                    : localMode
                      ? c("Submit test request", "提交测试信息")
                      : c("Check preview", "检查预览")
                : c("Continue", "继续")}
              <Icon name="arrow" size={20} />
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
