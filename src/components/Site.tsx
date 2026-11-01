import { coreText } from "@/lib/core-copy";
import Link from "next/link";
import { Header } from "./Header";
import { Icon } from "./Icon";
import { GuideGrid } from "./GuideGrid";
import { InquiryForm } from "./InquiryForm";
import { services, guides, faqs, p, guideCategories, type Pair } from "@/lib/content";
import type { Locale } from "@/lib/routes";
const copy = (locale: Locale) => (en: string, zh: string) => coreText(locale, en, zh);
function Button({
  locale,
  to = "request",
  children,
  light = false,
}: {
  locale: Locale;
  to?: string;
  children: React.ReactNode;
  light?: boolean;
}) {
  return (
    <Link className={`button ${light ? "light" : ""}`} href={`/${locale}/${to}`}>
      {children}
      <Icon name="arrow" size={19} />
    </Link>
  );
}
function ServiceCards({ locale, all = false }: { locale: Locale; all?: boolean }) {
  return (
    <div className="service-grid">
      {services.slice(0, all ? 7 : 5).map((s, i) => (
        <Link className="service-card" href={`/${locale}/services/${s.slug}`} key={s.slug}>
          <div className="card-top">
            <Icon name={s.icon} size={30} />
            <span>0{i + 1}</span>
          </div>
          <h3>{s.title[locale]}</h3>
          <p>{s.short[locale]}</p>
          <span className="card-arrow">↗</span>
        </Link>
      ))}
    </div>
  );
}
function FAQ({ locale }: { locale: Locale }) {
  return (
    <div className="faq-list">
      {faqs.map(([q, a], i) => (
        <details key={i}>
          <summary>
            {q[locale]}
            <span>+</span>
          </summary>
          <p>{a[locale]}</p>
        </details>
      ))}
    </div>
  );
}
function CTA({ locale }: { locale: Locale }) {
  const c = copy(locale);
  return (
    <section className="cta">
      <div>
        <span className="eyebrow">{c("LET’S START WITH A CONVERSATION", "从一次沟通开始")}</span>
        <h2>
          {c("Your next chapter in China,", "您来中国，")}
          <br />
          <em>{c("with someone by your side.", "华伴同行。")}</em>
        </h2>
        <p>
          {c(
            "A few details are all we need to start understanding your visit.",
            "告诉我们一些初步想法，一起梳理您的来华安排。",
          )}
        </p>
      </div>
      <Button locale={locale} light>
        {c("Tell us what you need", "提交服务需求")}
      </Button>
    </section>
  );
}
function Footer({ locale }: { locale: Locale }) {
  const c = copy(locale);
  return (
    <footer>
      <div className="footer-main">
        <div>
          <Link className="brand footer-brand" href={`/${locale}`}>
            <span className="brand-mark">伴</span>
            <span>
              <b>华伴.</b>
              <small>HUA COMPANION</small>
            </span>
          </Link>
          <p>{c("Your local companion in China.", "您来中国，华伴同行。")}</p>
          <span className="footer-location">
            ◎ {c("Starting in Shanghai, China", "从中国上海出发")}
          </span>
        </div>
        <div>
          <h4>{c("Explore", "了解华伴")}</h4>
          <Link href={`/${locale}/services`}>{c("Our services", "来华服务")}</Link>
          <Link href={`/${locale}/guides`}>{c("China guide", "来华指南")}</Link>
          <Link href={`/${locale}/about`}>{c("About Hua Companion", "关于华伴")}</Link>
        </div>
        <div>
          <h4>{c("Let’s connect", "与我们联系")}</h4>
          <Link href={`/${locale}/request`}>{c("Plan your visit", "提交服务需求")}</Link>
          <Link href={`/${locale}/partners`}>{c("Become a partner", "申请合作")}</Link>
          <Link href={`/${locale}/contact`}>{c("Contact information", "联系信息")}</Link>
        </div>
        <div className="footer-note">
          <h4>{c("Thoughtful coordination. Clear expectations.", "用心协调，清楚约定。")}</h4>
          <p>
            {c(
              "Service availability, providers and responsibilities are confirmed in each proposal.",
              "服务可用性、实际服务商与责任边界，均在具体方案中确认。",
            )}
          </p>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Hua Companion · 华伴</span>
        <div>
          <Link href={`/${locale}/privacy`}>{c("Privacy notice", "隐私说明")}</Link>
          <Link href={`/${locale}/terms`}>{c("Service boundaries", "服务边界")}</Link>
        </div>
        <span>
          {c("Company and contact details pending verification.", "公司主体与联系方式待核实。")}
        </span>
      </div>
    </footer>
  );
}
function Intro({
  locale,
  label,
  title,
  description,
}: {
  locale: Locale;
  label: Pair;
  title: Pair;
  description: Pair;
}) {
  return (
    <section className="page-intro">
      <div className="breadcrumb">
        <Link href={`/${locale}`}>{coreText(locale, "Home")}</Link>
        <span>/</span>
        {label[locale]}
      </div>
      <span className="eyebrow">{label[locale]}</span>
      <h1>{title[locale]}</h1>
      <p>{description[locale]}</p>
    </section>
  );
}
function Home({ locale }: { locale: Locale }) {
  const c = copy(locale);
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" />
            {c("ROOTED IN SHANGHAI. HERE FOR YOUR JOURNEY.", "立足上海 · 陪伴您的来华之旅")}
          </div>
          <h1>
            {c("China, a little", "来中国，")}
            <br />
            <em>{c("closer.", "更从容。")}</em>
          </h1>
          <p className="hero-subtitle">
            {c("Your local companion in China.", "您来中国，华伴同行。")}
          </p>
          <p className="hero-description">
            {c(
              "From business visits to everyday arrangements, we help connect the details — so you can focus on why you’re here.",
              "从商务访问到日常安排，我们协助连接每一个细节，让您专注于此行真正重要的事。",
            )}
          </p>
          <div className="hero-actions">
            <Button locale={locale}>{c("Plan your visit", "提交服务需求")}</Button>
            <Link className="text-link" href={`/${locale}/partners`}>
              {c("Partner with us", "申请合作")} ↗
            </Link>
          </div>
          <div className="hero-foot">
            <span className="tiny-pin">◎</span>
            <span>
              {c(
                "Shanghai first. Other cities, by arrangement.",
                "以上海为起点，其他城市按需求确认。",
              )}
            </span>
          </div>
        </div>
        <div className="hero-visual">
          <img
            src="/shanghai.svg"
            alt={c(
              "Original illustration of the Shanghai skyline beside the Huangpu River",
              "原创插画：黄浦江畔的上海城市天际线",
            )}
          />
          <div className="vertical-label">SHANGHAI · 上海</div>
          <div className="image-caption">
            <span>31°13′ N &nbsp; 121°28′ E</span>
            <span>{c("A place to begin.", "从这里，开始。")}</span>
          </div>
          <span className="hero-stamp">
            华伴
            <br />
            <small>
              LOCAL CONNECTIONS
              <br />
              THOUGHTFUL SUPPORT
            </small>
          </span>
        </div>
      </section>
      <section className="intro-strip">
        <span>
          华伴 <i>/ huá bàn /</i>
        </span>
        <p>
          {c(
            "A local connection. A clearer plan. A more considered journey.",
            "在地的连接，清晰的安排，更周全的旅程。",
          )}
        </p>
        <Icon name="leaf" size={26} />
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{c("HOW WE CAN HELP", "我们能为您做什么")}</span>
            <h2>
              {c("Different reasons to visit.", "不同的来华理由，")}
              <br />
              <em>{c("One thoughtful starting point.", "同一个用心的起点。")}</em>
            </h2>
          </div>
          <Link href={`/${locale}/services`} className="text-link">
            {c("Explore all services", "探索全部服务")} ↗
          </Link>
        </div>
        <ServiceCards locale={locale} />
        <div className="supplement">
          <span>{c("A little extra support", "更多配套支持")}</span>
          <Link href={`/${locale}/services/interpretation`}>
            {c("Interpretation & accompaniment", "翻译与陪同")} ↗
          </Link>
          <Link href={`/${locale}/services/arrival`}>
            {c("Arrival & everyday essentials", "来华准备与生活协助")} ↗
          </Link>
        </div>
      </section>
      <section className="approach section">
        <div className="approach-intro">
          <span className="eyebrow">{c("A CLEARER WAY FORWARD", "每一步，都更清楚")}</span>
          <h2>
            {c("Good journeys begin", "好的行程，")}
            <br />
            <em>{c("with understanding.", "始于充分理解。")}</em>
          </h2>
          <p>
            {c(
              "You don’t need to have every detail figured out. We start with your needs, then clarify what is possible and who will deliver it.",
              "您不必提前想清所有细节。我们从理解需求开始，再确认可行安排与实际服务方。",
            )}
          </p>
          <Link className="text-link" href={`/${locale}/about`}>
            {c("Get to know Hua Companion", "了解华伴")} ↗
          </Link>
        </div>
        <ol className="steps">
          {[
            p("Tell us about your visit", "提交需求"),
            p("Let’s clarify the details", "沟通确认"),
            p("Receive a clear proposal", "获取方案"),
            p("Confirm the arrangements", "确认安排"),
            p("Stay connected along the way", "服务跟进"),
          ].map((s, i) => (
            <li key={i}>
              <span>0{i + 1}</span>
              <div>
                <h3>{s[locale]}</h3>
                <p>
                  {
                    [
                      p(
                        "Share your purpose, timing and priorities.",
                        "说明来华目的、时间和关注事项。",
                      ),
                      p(
                        "We confirm scope, availability and practical needs.",
                        "一起明确范围、资源与实际需求。",
                      ),
                      p(
                        "See providers, fees and responsibilities before deciding.",
                        "在决定前了解服务方、费用与责任。",
                      ),
                      p(
                        "Agree the terms and next steps for each service.",
                        "逐项确认条款与接下来的安排。",
                      ),
                      p(
                        "Keep a clear point of contact for coordination.",
                        "保留清晰的沟通与协调入口。",
                      ),
                    ][i][locale]
                  }
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="location-band">
        <div className="location-symbol">
          沪<span>SHANGHAI</span>
        </div>
        <div>
          <span className="eyebrow">{c("A LOCAL STARTING POINT", "立足上海，务实出发")}</span>
          <h2>{c("Grounded here. Open to your plans.", "从熟悉的地方，开始您的计划。")}</h2>
          <p>
            {c(
              "Our initial base is Shanghai. For other cities, we assess each request against the resources we can confirm. Clear expectations come before promises.",
              "华伴初期以上海为运营基地。其他城市根据具体需求与可确认的合作资源评估；每一项安排，先确认再承诺。",
            )}
          </p>
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{c("A LITTLE LOCAL KNOWLEDGE", "出发前，多了解一点")}</span>
            <h2>{c("Before you arrive.", "来华之前。")}</h2>
          </div>
          <Link className="text-link" href={`/${locale}/guides`}>
            {c("Visit the China guide", "查看来华指南")} ↗
          </Link>
        </div>
        <div className="home-guides">
          {guides.slice(0, 3).map((g) => (
            <Link className="home-guide" href={`/${locale}/guides/${g.slug}`} key={g.slug}>
              <div className={`guide-art art-${g.category}`}>
                <span>{["", "行", "商", "医"][g.category]}</span>
                <small>THE CHINA GUIDE</small>
              </div>
              <span className="eyebrow">
                {guideCategories[g.category][locale]} · {g.read} {c("MIN", "分钟")}
              </span>
              <h3>{g.title[locale]}</h3>
              <span className="text-link">{c("Read the guide", "阅读指南")} ↗</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="faq-section section">
        <div>
          <span className="eyebrow">{c("GOOD TO KNOW", "您可能想了解")}</span>
          <h2>
            {c("A few things,", "一些问题，")}
            <br />
            <em>{c("made clear.", "先说清楚。")}</em>
          </h2>
        </div>
        <FAQ locale={locale} />
      </section>
      <CTA locale={locale} />
    </>
  );
}
function ServicePage({ locale, slug }: { locale: Locale; slug?: string }) {
  const c = copy(locale);
  const s = services.find((x) => x.slug === slug);
  if (!s)
    return (
      <>
        <Intro
          locale={locale}
          label={p("OUR SERVICES", "来华服务")}
          title={p("A little support. A lot more clarity.", "多一份支持，多一份清晰。")}
          description={p(
            "Coordinating the practical details of your time in China, starting in Shanghai.",
            "从上海出发，协助协调您在中国的各项实际安排。",
          )}
        />
        <section className="section tight">
          <ServiceCards locale={locale} all />
          <div className="notice">
            {c(
              "Availability and operating providers are confirmed for each request. You do not need to choose a business model when enquiring.",
              "每项需求均需确认可用性与实际承接方。初次咨询时，您不需要选择经营模式。",
            )}
          </div>
        </section>
        <CTA locale={locale} />
      </>
    );
  return (
    <>
      <Intro
        locale={locale}
        label={p("OUR SERVICES", "来华服务")}
        title={s.title}
        description={s.intro}
      />
      <section className="section detail-grid">
        <div>
          <div className="detail-icon">
            <Icon name={s.icon} size={42} />
          </div>
          <h2>{c("What we can help coordinate", "我们可以协助协调")}</h2>
          <ul className="feature-list">
            {s.items.map((x, i) => (
              <li key={i}>
                <Icon name="check" size={22} />
                <span>{x[locale]}</span>
              </li>
            ))}
          </ul>
          <div className="boundary">
            <span className="eyebrow">{c("CLEAR BOUNDARIES", "服务边界")}</span>
            <p>{s.boundary[locale]}</p>
          </div>
          <h3>{c("What happens next", "接下来如何安排")}</h3>
          <p>
            {c(
              "We review your request, clarify details and confirm available resources. The proposal " +
                "names the actual provider, contracting and payment parties, included and excluded " +
                "items, fees and cancellation terms.",
              "我们整理需求、沟通细节并确认资源。方案会写明实际服务方、签约方、收款方、包含与排除事项、费用及取消规则。",
            )}
          </p>
        </div>
        <aside className="side-card">
          <span className="eyebrow">{c("LET’S MAKE A START", "从需求开始")}</span>
          <h3>{c("Tell us what matters to you.", "告诉我们您的关注事项。")}</h3>
          <p>{s.prepare[locale]}</p>
          <Button locale={locale} to={`request?service=${s.slug}`}>
            {c("Start an enquiry", "提交此类需求")}
          </Button>
          <small>
            {c(
              "No detailed medical history or identity numbers, please.",
              "请勿填写详细病史或证件号码。",
            )}
          </small>
        </aside>
      </section>
      <section className="section tight">
        <h2>{c("Other ways we can help", "更多服务支持")}</h2>
        <div className="related-links">
          {services
            .filter((x) => x.slug !== s.slug)
            .map((x) => (
              <Link href={`/${locale}/services/${x.slug}`} key={x.slug}>
                {x.title[locale]} ↗
              </Link>
            ))}
        </div>
      </section>
    </>
  );
}
function Partners({ locale }: { locale: Locale }) {
  const c = copy(locale);
  return (
    <>
      <Intro
        locale={locale}
        label={p("GROW WITH US", "合作伙伴招募")}
        title={p("Local expertise. Shared care.", "专业所长，共同同行。")}
        description={p(
          "We are building a service network from Shanghai. If your organisation values clear communication and dependable delivery, we would like to learn about your capabilities.",
          "我们正从上海起步建立服务网络。如果您的机构重视清晰沟通与可靠交付，欢迎介绍您的服务能力。",
        )}
      />
      <section className="section detail-grid">
        <div>
          <h2>{c("Who we hope to meet", "我们期待认识这样的伙伴")}</h2>
          <div className="partner-types">
            {[
              p("Hospital service departments", "医院相关服务部门"),
              p("Travel agencies", "旅行社"),
              p("Hotels & apartments", "酒店与公寓"),
              p("Transport providers", "车队"),
              p("Interpreters", "翻译"),
              p("Business reception & specialists", "商务接待及专业服务机构"),
            ].map((s, i) => (
              <div key={i}>
                <span>0{i + 1}</span>
                {s[locale]}
              </div>
            ))}
          </div>
          <h3>{c("A considered onboarding process", "认真对待每一份合作申请")}</h3>
          <p>
            {c(
              "Application → capability review → verification → agreement, where appropriate. Public display requires separate approval. An application alone does not establish a partnership.",
              "提交申请 → 能力审核 → 信息核实 → 条件具备后签约。公开展示需要独立批准，提交申请并不自动建立合作关系。",
            )}
          </p>
          <div className="boundary">
            {c(
              "We do not yet have an established formal provider network. No organisation is presented here as a confirmed partner.",
              "目前尚未建立正式服务商网络。本页面不展示未经确认的合作机构。",
            )}
          </div>
        </div>
        <aside className="side-card">
          <span className="eyebrow">{c("INTRODUCE YOUR ORGANISATION", "介绍您的机构")}</span>
          <h3>{c("Let’s explore the fit.", "从了解彼此开始。")}</h3>
          <p>
            {c(
              "Share your service areas, supported languages and delivery capabilities. No document upload is required at this stage.",
              "介绍服务区域、支持语言与交付能力。初期无需上传证件材料。",
            )}
          </p>
          <Button locale={locale} to="apply">
            {c("Apply to collaborate", "填写合作申请")}
          </Button>
        </aside>
      </section>
    </>
  );
}
function About({ locale }: { locale: Locale }) {
  const c = copy(locale);
  return (
    <>
      <Intro
        locale={locale}
        label={p("ABOUT HUA COMPANION", "关于华伴")}
        title={p("A companion for the practical details.", "做您在中国的在地同行者。")}
        description={p(
          "Hua Companion is taking shape in Shanghai to help international visitors navigate service arrangements with clearer communication and expectations.",
          "华伴从上海起步，面向外国客户提供来华服务协调，让沟通更清楚，让安排更有序。",
        )}
      />
      <section className="section about-grid">
        <div className="about-art">
          <img src="/shanghai.svg" alt={c("Shanghai skyline illustration", "上海天际线插画")} />
        </div>
        <div>
          <span className="eyebrow">{c("OUR STARTING POINT", "我们的起点")}</span>
          <h2>
            {c("Practical experience.", "务实的经验，")}
            <br />
            <em>{c("A thoughtful approach.", "用心的协调。")}</em>
          </h2>
          <p>
            {c(
              "Our founder’s existing business sells Chinese-made hardware and electrical products on " +
                "Amazon. That experience informs our interest in cross-border communication and " +
                "business visits, while Hua Companion welcomes a broader range of needs.",
              "创始人现有业务是在亚马逊销售中国制造的五金与电器。这份经历帮助我们理解跨境沟通与商务访问的实际需求，华伴也面向更广泛的来华服务需求。",
            )}
          </p>
          <p>
            {c(
              "We are at an early stage of developing our service capabilities and provider network. " +
                "We confirm what can be arranged for each request and explain responsibilities before a " +
                "commitment is made.",
              "我们正逐步建设服务能力与合作网络。每项需求均先确认资源与可行安排，在作出承诺前说明责任边界。",
            )}
          </p>
        </div>
      </section>
      <section className="section model-section">
        <h2>{c("How services may be arranged", "服务如何组织")}</h2>
        <div className="two-grid">
          <article className="model-card">
            <span>01</span>
            <h3>{c("Provider introduction & coordination", "合作对接")}</h3>
            <p>
              {c(
                "For independent providers: we clarify needs, help identify suitable options and coordinate communication. Any coordination fee is explained in advance.",
                "面向可独立完成服务的机构：华伴整理需求、筛选介绍并协调沟通，相关服务费事先说明。",
              )}
            </p>
          </article>
          <article className="model-card">
            <span>02</span>
            <h3>{c("Hua Companion coordination", "华伴统筹")}</h3>
            <p>
              {c(
                "Where the necessary operating conditions are met, we may coordinate a combined proposal with named responsibilities, pricing and follow-up arrangements.",
                "在具备相应经营条件后，华伴可制定组合方案、报价、签约收款并安排负责人协调售后。",
              )}
            </p>
          </article>
        </div>
        <p className="muted">
          {c(
            "You do not need to choose a model. One proposal may contain different arrangements, with the provider, contracting and payment parties named for each item.",
            "您无需自行选择模式。同一方案可包含不同安排，每项明确服务方、签约方及收款方。",
          )}
        </p>
      </section>
      <CTA locale={locale} />
    </>
  );
}
function Contact({ locale }: { locale: Locale }) {
  const c = copy(locale);
  return (
    <>
      <Intro
        locale={locale}
        label={p("GET IN TOUCH", "联系我们")}
        title={p("Every good plan starts with a conversation.", "每一份好安排，从沟通开始。")}
        description={p(
          "Tell us about your visit or introduce your organisation. We will help identify the right next step once enquiry services are available.",
          "说明您的来华需求，或介绍您的机构。咨询服务开通后，我们将协助明确下一步。",
        )}
      />
      <section className="section two-grid">
        <article className="contact-card">
          <Icon name="travel" />
          <h2>{c("Planning a visit?", "计划来中国？")}</h2>
          <p>
            {c(
              "Share your purpose, timing and the kind of support you are looking for.",
              "告诉我们来华目的、预计时间与希望获得的协助。",
            )}
          </p>
          <Button locale={locale}>{c("Service enquiry", "提交服务需求")}</Button>
        </article>
        <article className="contact-card">
          <Icon name="business" />
          <h2>{c("Offering a service?", "希望成为服务伙伴？")}</h2>
          <p>
            {c(
              "Introduce your service areas, languages and capabilities for review.",
              "介绍服务区域、支持语言和交付能力，供我们审核。",
            )}
          </p>
          <Button locale={locale} to="apply">
            {c("Partner application", "提交合作申请")}
          </Button>
        </article>
      </section>
      <section className="section tight">
        <div className="notice">
          <h3>{c("Contact channels are being prepared", "联系方式正在准备中")}</h3>
          <p>
            {c(
              "Verified company details, email and other contact channels will be added before launch. Local test forms save fictional enquiries only. No live human or AI chat is operating.",
              "核实后的公司主体、邮箱及其他联系渠道将在上线前补齐。本地表单仅用于保存虚构测试咨询，尚未开通实时人工或 AI 客服。",
            )}
          </p>
        </div>
        <FAQ locale={locale} />
      </section>
    </>
  );
}
function GuidePage({ locale, slug }: { locale: Locale; slug?: string }) {
  const c = copy(locale);
  const g = guides.find((x) => x.slug === slug);
  if (!g)
    return (
      <>
        <Intro
          locale={locale}
          label={p("THE CHINA GUIDE", "来华指南")}
          title={p("A little knowledge goes a long way.", "多了解一点，出发更从容。")}
          description={p(
            "Practical reading for a more considered visit. Start with the details that matter to you.",
            "从您关心的细节开始，为来华行程做一些实用准备。",
          )}
        />
        <section className="section tight">
          <GuideGrid locale={locale} />
        </section>
      </>
    );
  return (
    <>
      <Intro
        locale={locale}
        label={guideCategories[g.category]}
        title={g.title}
        description={g.desc}
      />
      <section className="section article-layout">
        <article className="article">
          <div className="article-meta">
            {c("Editorial draft · Hua Companion", "编辑草稿 · 华伴")}
            <br />
            {c(
              "Updated 26 October 2026 · Pending human review",
              "更新于 2026年10月26日 · 待人工审核",
            )}
          </div>
          {g.sections.map((s, i) =>
            i % 2 === 0 ? <h2 key={i}>{s[locale]}</h2> : <p key={i}>{s[locale]}</p>,
          )}
          <div className="source-note">
            <h3>{c("Source & applicability", "来源与适用说明")}</h3>
            <p>
              {c(
                "Source: the Hua Companion project brief and service-scope checklist. This is general " +
                  "process guidance, not a verified statement of current visa, medical or provider " +
                  "policy. Check date-sensitive requirements with the relevant official institution " +
                  "before acting.",
                "来源：华伴建设任务书及服务范围清单。本文为一般流程指引，不是对当前签证、医疗或服务商政策的核实说明；涉及日期的要求请向相关官方机构确认。",
              )}
            </p>
          </div>
          <Link className="text-link" href={`/${locale}/guides`}>
            ← {c("All guides", "全部指南")}
          </Link>
        </article>
        <aside className="side-card">
          <span className="eyebrow">{c("MAKE IT PERSONAL", "结合您的行程")}</span>
          <h3>{c("Need help with the details?", "需要协助整理细节？")}</h3>
          <p>{c("Start with your purpose and priorities.", "先告诉我们此行目的与关注事项。")}</p>
          <Button locale={locale}>{c("Plan your visit", "提交需求")}</Button>
        </aside>
      </section>
    </>
  );
}
function Legal({ locale, privacy }: { locale: Locale; privacy: boolean }) {
  const c = copy(locale);
  return (
    <>
      <Intro
        locale={locale}
        label={p("CLEAR EXPECTATIONS", "清楚约定")}
        title={
          privacy
            ? p("Privacy notice — preview", "隐私说明 — 预览稿")
            : p("Service boundaries", "服务边界")
        }
        description={p(
          "Please read these points before sharing information or confirming arrangements.",
          "分享信息或确认安排前，请阅读以下说明。",
        )}
      />
      <section className="section article">
        <h2>{c("Current preview", "当前预览")}</h2>
        <p>
          {c(
            "In local testing mode, submissions are saved in a PostgreSQL database on this computer " +
              "for workflow testing. Only authorised staff can access them. Please use fictional " +
              "details only. No email or model service receives the submission. The local " +
              "administrator can remove test records; database backups may retain copies. Company " +
              "identity and contact channels are not yet verified.",
            "本地测试模式会将提交内容保存到本机 PostgreSQL 数据库，用于业务流程测试；仅授权员工可访问。请仅使用虚构资料。信息不会发送给邮件或模型服务。管理员可清理测试记录，数据库备份可能保留副本。公司主体和联系方式尚待核实。",
          )}
        </p>
        {privacy ? (
          <>
            <h2>{c("Planned information use", "拟收集信息及用途")}</h2>
            <p>
              {c(
                "The operational site will collect only the contact and service-request details needed " +
                  "to review enquiries, coordinate follow-up and assess provider applications. Medical " +
                  "records and identification documents will not be accepted through these forms.",
                "正式运营网站拟仅收集审核咨询、协调跟进及评估合作申请所需的联系方式与需求资料。表单不接收病历或证件材料。",
              )}
            </p>
            <h2>{c("Before launch", "上线前补齐")}</h2>
            <p>
              {c(
                "The final notice must identify the operating entity and privacy contact, data " +
                  "processors and locations, retention periods, deletion and access procedures, and any " +
                  "necessary cross-border arrangements. This preview notice is not a completed production " +
                  "privacy policy.",
                "正式隐私告知须补齐运营主体、隐私联系人、数据处理服务商与存放地区、保留期限、查阅删除流程及必要的跨境安排。本预览说明并非已完成的正式隐私政策。",
              )}
            </p>
            <h2>{c("Your control", "您的选择")}</h2>
            <p>
              {c(
                "Optional fields will remain optional. Any additional sharing with an institution or " +
                  "model service must be explained and limited to what is needed. Passwords and " +
                  "verification codes must never be provided.",
                "可选字段保持可选。向机构或模型服务进一步传递信息时，应说明用途并限制在必要范围内。请勿提供密码或验证码。",
              )}
            </p>
          </>
        ) : (
          <>
            {services.map((s) => (
              <div key={s.slug}>
                <h2>{s.title[locale]}</h2>
                <p>{s.boundary[locale]}</p>
              </div>
            ))}
            <h2>{c("Quotes and responsibility", "报价与责任")}</h2>
            <p>
              {c(
                "A confirmed proposal must state providers, contracting and payment parties, fees, " +
                  "inclusions, exclusions and cancellation rules. Hua Companion does not automatically " +
                  "collect payment for every service.",
                "确认方案须说明实际服务方、签约方、收款方、费用、包含及排除事项与取消规则。华伴不默认对所有服务统一收款。",
              )}
            </p>
          </>
        )}
      </section>
    </>
  );
}
export function Site({
  locale,
  slug = [],
  initialService,
  catalogSelection,
}: {
  locale: Locale;
  slug?: string[];
  initialService?: string;
  catalogSelection?: import("./InquiryForm").CatalogSelection;
}) {
  let page: React.ReactNode;
  switch (slug[0]) {
    case "services":
      page = <ServicePage locale={locale} slug={slug[1]} />;
      break;
    case "guides":
      page = <GuidePage locale={locale} slug={slug[1]} />;
      break;
    case "partners":
      page = <Partners locale={locale} />;
      break;
    case "about":
      page = <About locale={locale} />;
      break;
    case "contact":
      page = <Contact locale={locale} />;
      break;
    case "request":
    case "apply":
      page = (
        <InquiryForm
          locale={locale}
          kind={slug[0]}
          initialService={initialService}
          catalogSelection={catalogSelection}
        />
      );
      break;
    case "privacy":
    case "terms":
      page = <Legal locale={locale} privacy={slug[0] === "privacy"} />;
      break;
    default:
      page = <Home locale={locale} />;
  }
  return (
    <>
      <a className="skip-link" href="#main">
        {coreText(locale, "Skip to content")}
      </a>
      <Header locale={locale} />
      <main id="main">{page}</main>
      <Footer locale={locale} />
    </>
  );
}
