import { emptyCatalog } from "../../src/lib/catalog.ts";
import type { ContentBody } from "../../src/lib/content-model.ts";
import { catalogCities } from "../../src/lib/catalog-options.ts";

type Copy = {
  title: string;
  summary: string;
  audience: string;
  includes: string;
  excludes: string;
  process: string;
  deliverables: string;
  materials: string;
  bookingNotice: string;
  duration: string;
  people: string;
  changes: string;
  quotation: string;
  options: string;
  combinations: string;
};
type Project = {
  slug: string;
  category: number;
  categories: string[];
  guides: string[];
  zh: Copy;
  en: Copy;
};

// Proposed offerings, not approved commitments or available inventory.
export const starterProjects: Project[] = [
  {
    slug: "arrival-and-check-in",
    category: 4,
    categories: ["arrival", "transport", "stays"],
    guides: ["pickup-confirmation", "luggage-and-vehicle", "hotel-comparison"],
    zh: {
      title: "抵达与入住协助",
      summary: "把航班落地、接机衔接和酒店入住串成清楚的到达计划，减少首次来华时的沟通与找路负担。",
      audience:
        "首次来华、抵达时间较晚、携带较多行李，或希望有人协助与司机和酒店沟通的个人及家庭。",
      includes:
        "行前核对航班、到达航站楼、酒店地址和行李情况；协助确认接机点及联络方式；按确认方案提供远程沟通或现场陪同；协助向酒店表达入住与房间需求；交接下一段行程信息。",
      excludes:
        "机票、酒店、车辆及停车通行费用不默认包含；不办理入境审批，不代管护照；不保证提前入住、延迟退房或指定房型；不包含全天候随叫随到服务。",
      process:
        "1. 收集抵达信息与入住需求。\n2. 向实际接送方和酒店核实接待安排。\n3. 确认接机位置、等待规则、服务起止点和费用。\n4. 按方案提供沟通或陪同。\n5. 确认客户抵达约定交接点并完成收尾。",
      deliverables:
        "一份中英文抵达安排单，包含目的地地址、接机识别方式、约定联络窗口和异常处理步骤；服务结束时确认入住沟通结果及仍需客户自行处理的事项。",
      materials:
        "航班号、日期、抵达机场和航站楼（如已知）、人数、行李件数、酒店名称与地址、希望沟通的入住需求。首次咨询无需上传证件或完整预订凭证。",
      bookingNotice:
        "提供航班信息后再确认承接。晚间抵达、大件行李、儿童座椅、无障碍用车及现场陪同需提前单独核实。具体城市、车辆和人员尚需确认。",
      duration:
        "按远程协调或现场陪同分别报价；从何时计时、等待多久、超时如何计算，均在方案中列明。",
      people: "按同行人数、行李及车辆条件确认承接范围；婴幼儿和行动辅助需求应在询价时说明。",
      changes:
        "航班、酒店或人数变化应及时通知华伴。延误等待、改派、取消和已发生的第三方费用，按预先确认的书面规则处理。",
      quotation:
        "报价需列明协调或陪同费用、车辆是否单独计费、等待额度、夜间和超时条件、第三方费用及取消规则；不把接送车费默认为陪同费的一部分。",
      options:
        "可分别询价：远程抵达协调、机场至酒店现场陪同、入住后的简短生活熟悉。各项服务独立确认范围。",
      combinations: "可衔接初到中国生活适应陪同；商务客户可在次日接续展会采购陪同或工厂访问协助。",
    },
    en: {
      title: "Arrival and hotel check-in assistance",
      summary:
        "Connect your arrival, pickup and hotel check-in in one clear plan, with language support where it is needed.",
      audience:
        "First-time visitors, late arrivals, travellers with substantial luggage, and individuals or families who want help communicating with transport and accommodation providers.",
      includes:
        "Review flight details, terminal, hotel address and luggage; coordinate pickup instructions and contact arrangements; provide remote communication or in-person accompaniment as agreed; help express check-in and room requests; hand over information for the next part of the visit.",
      excludes:
        "Flights, accommodation, vehicles, parking and tolls are not included unless stated. No immigration processing or passport custody. Early check-in, late checkout and particular room types are not guaranteed. No unrestricted around-the-clock on-call service.",
      process:
        "1. Collect arrival and accommodation requirements.\n2. Check arrangements with the transport provider and hotel.\n3. Confirm meeting point, waiting rules, service start/end and charges.\n4. Deliver the agreed communication or accompaniment.\n5. Confirm arrival at the agreed handover point and outstanding actions.",
      deliverables:
        "A bilingual arrival brief with the destination address, pickup identification, agreed contact window and disruption steps; a closing summary of check-in communication and any remaining customer actions.",
      materials:
        "Flight number and date, airport and terminal if known, group size, luggage count, hotel name/address and check-in requests. Identity documents or complete booking confirmations are not needed for the initial enquiry.",
      bookingNotice:
        "Acceptance is confirmed after reviewing flight details. Late arrivals, large luggage, child seats, accessible vehicles and in-person accompaniment require separate advance checks. City coverage, vehicles and personnel remain subject to confirmation.",
      duration:
        "Remote coordination and in-person accompaniment are quoted separately. The proposal defines when time starts, the waiting allowance and overtime terms.",
      people:
        "Capacity is confirmed against party size, luggage and vehicle conditions. Mention infants and mobility-related requirements when enquiring.",
      changes:
        "Notify Hua promptly of flight, hotel or party changes. Delay waiting, reassignment, cancellations and incurred third-party costs follow the written terms agreed beforehand.",
      quotation:
        "The quote should separate coordination/accompaniment, vehicle charges, waiting allowance, late-hour/overtime conditions, third-party expenses and cancellation rules.",
      options:
        "Enquire separately about remote arrival coordination, airport-to-hotel accompaniment and a short orientation after check-in. Each has its own confirmed scope.",
      combinations:
        "Can connect to settling-in assistance, or to exhibition and factory-visit support on subsequent days.",
    },
  },
  {
    slug: "exhibition-sourcing-support",
    category: 2,
    categories: ["business", "interpretation"],
    guides: [
      "exhibition-buyer-checklist",
      "comparable-supplier-quotes",
      "interpreter-briefing-pack",
    ],
    zh: {
      title: "展会采购陪同",
      summary:
        "围绕采购目标安排展前准备、现场沟通与展后线索整理，帮助客户把参展时间用在关键问题上。",
      audience: "来华寻找产品、供应商或合作机会，需要中英文沟通支持的采购商和商务团队。",
      includes:
        "整理目标产品与展商清单；协助预约展商沟通；按约定路线提供展会陪同与口译；记录产品规格、报价条件和待核实事项；会后整理供应商线索与下一步。",
      excludes:
        "展会入场资格、门票、交通及餐饮不默认包含；不保证展商回复或成交；不替代供应商信用调查、产品检测、认证或合同审查；不代客户作采购决定。",
      process:
        "1. 明确采购目标与筛选标准。\n2. 客户确认拟拜访展商及路线。\n3. 核实展会日期、入场和预约条件。\n4. 现场按问题清单沟通并记录。\n5. 整理可跟进线索和未解决问题。",
      deliverables:
        "展前拜访清单、现场沟通记录、按统一字段整理的供应商线索表，以及注明信息来源和待确认项的跟进清单。",
      materials:
        "产品类别、用途、目标市场、关键规格、数量范围、希望比较的报价条件、可分享的图纸或图片、展会名称及日期。",
      bookingNotice:
        "先确认展会及采购领域，再核实人员与专业词汇准备。入场和展商预约由相关机构确认，不以提交咨询视为预约成功。",
      duration: "按确认的半日、全日或多日范围询价；工作时段、休息、转场和超时规则写入方案。",
      people:
        "按团队人数、是否需要分组走展和同时沟通的场次数确认人员安排；不默认一位陪同人员支持多个分散小组。",
      changes:
        "展会日期、名单或产品范围变化需重新确认工作量。临时增加场次、跨馆转场和延时先确认费用；取消按书面约定处理。",
      quotation:
        "按服务日期、专业准备程度、团队安排和整理工作量询价；门票、交通、餐饮及后续跟进是否包含须逐项列明。",
      options:
        "可选择展前准备、现场陪同、展后线索整理，或组合询价。展后持续沟通作为单独约定的工作。",
      combinations:
        "对合适线索可另行安排五金电器工厂访问协助；需要正式讨论时，可衔接商务翻译与会议支持。",
    },
    en: {
      title: "Exhibition sourcing accompaniment",
      summary:
        "Prepare targeted visits, support conversations on the exhibition floor and organize leads for useful follow-up.",
      audience:
        "Buyers and business teams exploring products, suppliers or partnerships who need Chinese-English communication support.",
      includes:
        "Organize target products and exhibitors; assist with meeting requests; provide agreed accompaniment and interpretation; record specifications, quotation conditions and unresolved questions; consolidate leads and next steps.",
      excludes:
        "Admission eligibility, tickets, transport and meals are not included unless stated. No promise of exhibitor responses or sales. This is not supplier due diligence, product testing, certification or contract review, and Hua does not make purchasing decisions.",
      process:
        "1. Define sourcing goals and screening criteria.\n2. Have the customer confirm exhibitors and route.\n3. Verify dates, admission and meeting requirements.\n4. Discuss the question list and record responses.\n5. Consolidate leads and unresolved issues.",
      deliverables:
        "A pre-visit exhibitor list, conversation notes, a supplier lead sheet with consistent fields, and follow-up actions showing information sources and items still to verify.",
      materials:
        "Product category, intended use, destination market, essential specifications, quantity range, quotation conditions to compare, shareable drawings/images, exhibition name and dates.",
      bookingNotice:
        "Confirm the event and product field before checking personnel and terminology preparation. Admission and exhibitor appointments require confirmation by the relevant parties; an enquiry is not a reservation.",
      duration:
        "Enquire for an agreed half-day, full-day or multi-day scope. Working hours, breaks, transfers and overtime rules are set out in the proposal.",
      people:
        "Staffing depends on team size, separate touring groups and simultaneous discussions. One companion is not assumed to cover multiple dispersed groups.",
      changes:
        "Changes to dates, exhibitors or product scope may change the workload. Additional meetings, transfers and overtime require agreement; cancellation follows the written terms.",
      quotation:
        "Quoted by dates, specialist preparation, staffing and documentation effort. Tickets, transport, meals and subsequent follow-up must be itemized as included or additional.",
      options:
        "Pre-event preparation, on-site accompaniment and post-event lead consolidation can be scoped separately or together. Ongoing follow-up is a separately agreed task.",
      combinations:
        "Promising leads can progress to factory-visit coordination or a separately arranged interpreted business meeting.",
    },
  },
  {
    slug: "hardware-electrical-factory-visits",
    category: 2,
    categories: ["business", "interpretation"],
    guides: [
      "hardware-electrical-visit-brief",
      "factory-visit-agenda",
      "comparable-supplier-quotes",
    ],
    zh: {
      title: "五金电器工厂访问协助",
      summary: "围绕产品规格、样品和交付问题组织工厂访问，把现场沟通整理成可核对、可跟进的记录。",
      audience: "采购五金、工具、电器或相关零部件，希望与候选工厂深入沟通的海外采购商及产品团队。",
      includes:
        "整理产品需求和工厂问题清单；与客户指定或另行确认的候选机构沟通访问安排；协调行程及口译；按批准范围陪同参观；记录规格差异、样品条件、报价前提和后续责任人。",
      excludes:
        "不包含独立验厂、质量检验、认证核查、法律审查或供应商信用担保；不保证工厂身份、产能、交期或产品合规；车辆、检测、样品与寄送费用需另行确认。",
      process:
        "1. 整理需求与可分享资料。\n2. 明确候选工厂名单及名单来源。\n3. 确认接待许可、议程、拍摄与保密要求。\n4. 现场沟通与记录。\n5. 由客户核对纪要，再形成待核实及跟进清单。",
      deliverables:
        "工厂访问议程、双语关键问题清单、会后纪要，以及按规格／样品／报价／交付分组的待办表；明确区分对方陈述与已取得证据。",
      materials:
        "产品用途、目标市场、图纸或照片、规格与容差、预计数量、样品要求、候选工厂名称、保密限制和不能变更的条件。",
      bookingNotice:
        "工厂接待、现场访问权限和合适口译人员须逐项确认。技术资料应预留审阅时间；涉及专业检测的事项另约具备相应能力的机构。",
      duration:
        "按访问家数、距离、技术准备和会后整理工作量确认；跨城、长途转场与额外讨论不默认包含在基础陪同时间内。",
      people: "按团队规模、议程分组和现场安全要求确认；进入生产区域须遵守实际工厂的接待规定。",
      changes:
        "工厂变更、临时拒绝接待或议程延长时，由华伴与客户确认替代安排与费用。未经客户确认不擅自更换考察对象。",
      quotation:
        "分别列明访问协调、技术词汇准备、口译陪同、交通和纪要整理；验厂、检测、样品及物流均单独说明。",
      options:
        "可从单厂访问开始，也可询价多厂比较行程。供应商寻找与初步筛选须另行约定范围和证据标准。",
      combinations:
        "可承接展会采购陪同后的实地访问，并衔接商务会议支持；样品跟进可作为后续独立任务询价。",
    },
    en: {
      title: "Hardware and electrical factory-visit assistance",
      summary:
        "Structure factory conversations around specifications, samples and delivery, with records that can be checked and followed up.",
      audience:
        "Overseas buyers and product teams sourcing hardware, tools, electrical goods or related components who want detailed discussions with prospective factories.",
      includes:
        "Prepare requirements and questions; coordinate visits with customer-nominated or separately agreed organizations; arrange itinerary and interpretation; accompany visits within authorized areas; record specification differences, sample terms, quotation assumptions and follow-up owners.",
      excludes:
        "Not an independent factory audit, quality inspection, certification check, legal review or supplier credit guarantee. Factory identity, capacity, lead times and compliance are not guaranteed. Transport, testing, samples and shipping require separate agreement.",
      process:
        "1. Organize requirements and shareable material.\n2. Confirm the candidate list and where it came from.\n3. Agree access, agenda, photography and confidentiality.\n4. Support discussions and take notes.\n5. Have the customer check the minutes before producing verification and follow-up actions.",
      deliverables:
        "A visit agenda, bilingual key-question list, meeting notes and actions grouped by specifications, samples, quotation and delivery; supplier statements are distinguished from evidence obtained.",
      materials:
        "Intended use, destination market, drawings/photos, specifications and tolerances, estimated quantities, sample requirements, factory candidates, confidentiality limits and non-negotiable conditions.",
      bookingNotice:
        "Factory reception, access and suitable interpreters require individual confirmation. Allow time to review technical material. Specialist testing needs separately engaged competent organizations.",
      duration:
        "Scope depends on factory count, distance, technical preparation and documentation. Cross-city transfers, long journeys and extra discussions are not automatically included in accompaniment time.",
      people:
        "Group size, parallel agendas and site safety requirements determine staffing. Factory reception rules govern access to production areas.",
      changes:
        "If a factory changes, declines reception or extends the agenda, Hua confirms alternatives and costs with the customer. Visit targets are not substituted without customer agreement.",
      quotation:
        "Separate coordination, terminology preparation, interpretation, transport and minutes. Audits, testing, samples and logistics must be explicitly addressed.",
      options:
        "Begin with a single-factory visit or enquire about a multi-factory comparison itinerary. Supplier discovery and initial screening require a separate scope and evidence standard.",
      combinations:
        "Can follow an exhibition visit and connect to business-meeting support. Sample follow-up can be quoted as a separate subsequent task.",
    },
  },
  {
    slug: "business-interpretation-and-meetings",
    category: 7,
    categories: ["interpretation", "business"],
    guides: ["choose-interpreter", "interpreter-briefing-pack", "interpreted-meeting-habits"],
    zh: {
      title: "商务翻译与会议支持",
      summary: "从会前术语和议程准备，到现场沟通及会后事项整理，帮助双方准确表达并确认理解。",
      audience: "需要开展中英文商务会谈、产品介绍、合作讨论或远程会议的个人与团队。",
      includes:
        "收集会议目标并准备术语；协助确认议程与参会安排；按约定提供交替传译或沟通陪同；经许可记录关键事项；整理供双方核对的行动清单。",
      excludes:
        "不默认提供同声传译、设备租赁、认证翻译或合同全文翻译；不代替律师、财务或技术专家作判断；未经许可不录音录像；不代表任何一方签约。",
      process:
        "1. 确认主题、语言方向及专业程度。\n2. 核实口译人员能力与保密要求。\n3. 客户审阅议程、术语和服务范围。\n4. 会议中翻译与澄清。\n5. 会后核对重点与待办。",
      deliverables:
        "会前术语／问题清单，以及在约定范围内的双语要点或行动纪要；纪要不自动构成双方已确认的合同或承诺。",
      materials:
        "议程、参会角色、产品资料、拟讨论问题、专业术语、是否涉及保密、线上平台或会场信息；只分享获准使用的资料。",
      bookingNotice:
        "先确认主题和材料量，再安排人员。专业性较强或连续多场会议需要额外准备；人员档期和具体支持方式由华伴确认。",
      duration:
        "按会前准备、会议时段和会后整理分别明确范围。半日或全日只是询价形式，具体工时、休息和超时条件另行约定。",
      people:
        "按会议人数、语言流向、平行分组和所需口译方式配置人员；不默认一人覆盖同时进行的会议。",
      changes:
        "议程、会议方式或专业领域变化可能需要重新安排人员及报价。延期、取消及已完成准备工作的费用按事先约定处理。",
      quotation:
        "报价拆分准备、口译、纪要、交通及必要设备；明确哪些文字整理包含在内，哪些需要另行翻译报价。",
      options:
        "可选择远程商务沟通、现场会议口译或会议加纪要；同声传译等其他需求先核实资源再另行报价。",
      combinations: "可单独使用，也可组合到展会采购、工厂访问或正式合作洽谈行程中。",
    },
    en: {
      title: "Business interpretation and meeting support",
      summary:
        "Prepare terminology and agendas, support accurate discussion and organize follow-up points for participants to check.",
      audience:
        "Individuals and teams holding Chinese-English business discussions, product presentations, partnership talks or remote meetings.",
      includes:
        "Review meeting goals and terminology; coordinate agendas and participants; provide agreed consecutive interpretation or communication support; record key points with permission; prepare actions for participant review.",
      excludes:
        "Simultaneous interpretation, equipment hire, certified translation and full contract translation are not included by default. No legal, financial or technical professional decisions. No recording without permission, and no signing on a participant's behalf.",
      process:
        "1. Confirm subject, language direction and technical depth.\n2. Check interpreter suitability and confidentiality.\n3. Have the customer review agenda, terminology and scope.\n4. Interpret and clarify during the meeting.\n5. Check key points and actions afterwards.",
      deliverables:
        "A terminology/question brief and, if agreed, bilingual key points or action notes. Notes do not automatically constitute a contract or commitments accepted by the parties.",
      materials:
        "Agenda, participant roles, product material, discussion questions, terminology, confidentiality requirements and venue or online platform details. Share authorized materials only.",
      bookingNotice:
        "Confirm the subject and material volume before allocating personnel. Specialist topics and consecutive meetings need additional preparation; Hua confirms staffing and support format.",
      duration:
        "Preparation, meeting time and documentation are scoped separately. Half-day/full-day options are enquiry formats; actual hours, breaks and overtime require agreement.",
      people:
        "Staffing depends on participants, language directions, parallel groups and interpretation format. One interpreter is not assumed to cover simultaneous meetings.",
      changes:
        "Changes to agenda, format or subject may require different personnel or pricing. Postponement, cancellation and completed preparation follow the agreed terms.",
      quotation:
        "Itemize preparation, interpretation, notes, travel and necessary equipment. Specify which written outputs are included and which need a separate translation quote.",
      options:
        "Remote business communication, on-site meeting interpretation or interpretation with notes. Other formats, including simultaneous interpretation, require separate resource confirmation.",
      combinations:
        "Available as a standalone scope or as part of exhibition visits, factory visits and partnership discussions.",
    },
  },
  {
    slug: "settling-in-orientation",
    category: 1,
    categories: ["arrival"],
    guides: ["connectivity-preparation", "payment-readiness", "communication-preferences"],
    zh: {
      title: "初到中国生活适应陪同",
      summary:
        "围绕客户实际要完成的日常事项，安排生活环境熟悉与沟通协助，逐步建立独立出行和办事的信心。",
      audience: "首次来华、计划短期工作或较长时间停留，希望熟悉日常生活方式的外国访客。",
      includes:
        "按需求熟悉住宿周边、交通与购物场所；讲解地图、打车和翻译工具的基本使用；陪同咨询通信服务；协助表达生活用品或配送需求；整理常用双语地址和办事清单。",
      excludes:
        "不承诺账号开通、支付绑定、通信办理或资格审核成功；不代管密码、验证码、银行卡及资金；不代客户确认交易；不包含长期代办或无限次远程支持。",
      process:
        "1. 选择最重要的日常事项。\n2. 核实相关门店或机构的要求与时间。\n3. 确认陪同路线和服务边界。\n4. 客户本人操作账号、签字和付款，陪同人员协助理解。\n5. 整理可自行使用的资料和未完成事项。",
      deliverables:
        "一份个性化生活适应清单、常用地点双语名称与地址，以及客户已了解的操作步骤和待进一步确认的事项。",
      materials:
        "居住区域、停留时长、手机系统、沟通语言、最希望解决的三至五件日常事务；不要在初次咨询提供账号密码、验证码或银行卡信息。",
      bookingNotice:
        "根据目标事项确认机构要求及可预约时间。需要证件的事项由客户向实际机构确认并自行出示，华伴不预先收集不必要的证件副本。",
      duration:
        "按一次陪同或分阶段任务询价；服务区域、事项数量、转场时间和后续答疑窗口在方案中明确。",
      people: "以个人或共同生活的小组为单位确认；多人存在不同办理需求时，分别评估所需时间。",
      changes:
        "办理条件或门店安排变化时，先与客户确认替代方案。未完成事项不被标记为已办妥；新增事项及再次陪同另行确认。",
      quotation:
        "按事项复杂度、陪同时段、交通与资料整理询价；通信套餐、购物、平台费用均由客户自行确认支付，不默认包含在服务费中。",
      options:
        "可拆分为住宿周边熟悉、手机与日常工具学习、通信及生活用品沟通三种小任务，按实际需要组合。",
      combinations: "适合接在抵达与入住协助之后；家庭访客可以再组合家庭城市出行协调。",
    },
    en: {
      title: "Settling-in and everyday-life orientation",
      summary:
        "Work through practical everyday tasks with local communication support so visitors can become more confident acting independently.",
      audience:
        "First-time visitors and people planning a work visit or longer stay who want to become familiar with daily life.",
      includes:
        "Explore the accommodation area, transport and shopping options; explain basic use of maps, ride-hailing and translation tools; accompany enquiries about connectivity; help communicate shopping or delivery needs; prepare bilingual addresses and a task checklist.",
      excludes:
        "No guarantee of account activation, payment linking, telecom registration or eligibility approval. Hua does not hold passwords, verification codes, cards or funds, or confirm transactions for the customer. Long-term errands and unlimited remote support are not included.",
      process:
        "1. Prioritize everyday tasks.\n2. Check relevant shop or institution requirements and hours.\n3. Agree the route and scope.\n4. The customer operates accounts, signs and pays while the companion helps with understanding.\n5. Record useful resources and unfinished tasks.",
      deliverables:
        "A personalized orientation checklist, bilingual place names and addresses, and a record of explained steps and outstanding questions.",
      materials:
        "Accommodation area, length of stay, phone operating system, communication language and three to five priority tasks. Do not supply passwords, verification codes or bank-card details in the initial enquiry.",
      bookingNotice:
        "Confirm institutional requirements and appointment availability for the chosen tasks. The customer verifies and presents any required identity documents directly; Hua does not collect unnecessary copies in advance.",
      duration:
        "Quote for a single session or staged tasks. Area, task count, travel time and any follow-up question window are specified in the proposal.",
      people:
        "Scope is agreed for an individual or a shared household group. Different individual registration needs are assessed for their time requirements.",
      changes:
        "If requirements or shop arrangements change, agree alternatives first. Unfinished tasks are recorded as such; extra tasks or repeat visits need separate confirmation.",
      quotation:
        "Based on task complexity, accompaniment time, travel and documentation. The customer confirms and pays for telecom plans, purchases and platform charges separately unless explicitly stated.",
      options:
        "Can be split into neighbourhood orientation, learning phone and everyday tools, and communication for connectivity or household purchases.",
      combinations:
        "Can follow arrival/check-in assistance and connect to family city-outing coordination.",
    },
  },
  {
    slug: "family-city-outing-coordination",
    category: 6,
    categories: ["travel", "transport"],
    guides: ["family-travel-needs", "shanghai-first-visit", "nearby-day-trip"],
    zh: {
      title: "家庭城市出行协调",
      summary:
        "把儿童、老人和不同成员的节奏提前纳入安排，围绕交通、休息与活动衔接组织更清楚的家庭出行计划。",
      audience: "带儿童、老人，或同行成员对步行强度、休息、饮食及交通有不同需求的来华家庭。",
      includes:
        "收集家庭成员的出行偏好与功能性需求；协调交通、活动时段和休息安排；帮助与实际场馆或服务方确认条件；按方案提供远程协调或现场沟通陪同；在计划变化时协助联系。",
      excludes:
        "不提供托管、专业护理或医疗监护；不保证场馆无障碍条件、儿童座椅供应或预约成功；门票、餐饮及车辆不默认包含；专业导游、旅行社产品需由相应服务方确认承接。",
      process:
        "1. 确认兴趣、年龄段、步行接受程度和休息需求。\n2. 整理适合节奏的候选安排。\n3. 向实际机构核实预约、交通和设施条件。\n4. 客户确认活动顺序、费用与替代方案。\n5. 按约定协调或陪同并记录变更。",
      deliverables:
        "家庭出行安排单，列明活动顺序、转场方式、约定休息点、已核实与待确认条件，以及适用时的天气或体力变化备选安排。",
      materials:
        "城市、日期、人数、儿童年龄段、成员兴趣、步行与休息偏好、需要的辅助设施及饮食沟通事项。只提供安排所需的信息，不要求详细病史。",
      bookingNotice:
        "儿童座椅、无障碍交通及特定活动预约需要提前核实。涉及专业导游、旅行社或护理服务的需求，先明确实际承接方与责任范围。",
      duration: "可询价半日、全日或分段协调；实际时间、休息、转场和现场陪同范围以确认方案为准。",
      people:
        "根据成人与儿童人数、车辆容量及是否分组确认。儿童始终由监护人照看；陪同不替代监护责任。",
      changes:
        "天气、成员体力、场馆或交通变化时，与客户确认调整方案。临时增加活动、改车、取消及不可退的第三方费用按书面约定处理。",
      quotation:
        "列明行程协调、现场陪同、车辆及第三方活动费用；明确儿童或老人专项设施是否可提供、是否另收费及取消条件。",
      options: "可按轻松城市半日、家庭日常出行或特定活动衔接询价。具体地点与活动在核实资源后确定。",
      combinations:
        "可与抵达入住、生活适应陪同组合；家庭成员参加商务行程时，可另行协调不同成员的活动，但需独立确认人员配置。",
    },
    en: {
      title: "Family city-outing coordination",
      summary:
        "Plan transport, breaks and activity transitions around the different pace and practical needs of children, older relatives and other family members.",
      audience:
        "Visiting families with children, older relatives or differing walking, rest, dietary and transport preferences.",
      includes:
        "Collect interests and functional requirements; coordinate transport, activity timing and breaks; check conditions with venues and providers; deliver agreed remote coordination or in-person communication support; assist with contacting parties when plans change.",
      excludes:
        "No childcare, professional care or medical supervision. Accessibility, child-seat supply and reservations are not guaranteed. Tickets, meals and vehicles are not included by default. Professional guiding or travel-agency products require confirmation by appropriate providers.",
      process:
        "1. Confirm interests, age ranges, walking tolerance and breaks.\n2. Prepare options at a suitable pace.\n3. Check reservations, transport and facilities with the actual parties.\n4. Obtain customer agreement on sequence, costs and alternatives.\n5. Coordinate or accompany as agreed and record changes.",
      deliverables:
        "A family outing brief covering activity order, transport, agreed rest stops, verified and unresolved conditions, and alternatives for weather or energy levels where applicable.",
      materials:
        "City, dates, group size, children's age ranges, interests, walking/rest preferences, necessary facilities and dietary communication needs. Provide only planning-relevant information; detailed medical histories are not requested.",
      bookingNotice:
        "Check child seats, accessible transport and specific reservations in advance. Identify the actual provider and responsibilities for professional guiding, travel-agency or care services before confirming.",
      duration:
        "Enquire for half-day, full-day or separate coordination segments. Actual time, breaks, transfers and on-site accompaniment are defined in the confirmed proposal.",
      people:
        "Adult/child count, vehicle capacity and separate groups determine arrangements. Guardians remain responsible for children; accompaniment does not replace supervision.",
      changes:
        "Agree adjustments when weather, energy levels, venues or transport change. Extra activities, replacement vehicles, cancellations and non-refundable third-party costs follow written terms.",
      quotation:
        "Itemize coordination, accompaniment, transport and third-party activities. Confirm the availability, additional cost and cancellation terms of any specialist facilities.",
      options:
        "Enquire about a relaxed city half-day, practical family travel or connections around a particular activity. Locations and activities are selected after resource checks.",
      combinations:
        "Can combine with arrival/check-in and settling-in support. Separate family activities during a business visit need their own confirmed staffing.",
    },
  },
];

export function buildStarterProjects(): ContentBody[] {
  return starterProjects.flatMap((project, index) =>
    (["zh", "en"] as const).map((locale) => {
      const text = project[locale];
      const planning =
        locale === "zh"
          ? `拟拓展城市：${catalogCities.map((c) => c.zh).join("、")}。本项目为待审核方案；尚未确认任何城市的具体承接资源。发布前请选择实际可承接的城市，确认服务方、服务窗口及条款。`
          : `Planned cities: ${catalogCities.map((c) => c.en).join(", ")}. This is a draft offering; local delivery resources are not confirmed. Before publication, select only confirmed service cities and approve providers, service windows and terms.`;
      return {
        kind: "service-project",
        contentKey: "hua-project-" + project.slug,
        slug: project.slug,
        locale,
        title: text.title,
        summary: text.summary,
        category: project.category,
        order: -100 + index,
        author:
          locale === "zh"
            ? "华伴项目策划草稿（待运营审核）"
            : "Hua Companion service-planning draft — pending review",
        sources: [],
        blocks: [
          { type: "heading", text: locale === "zh" ? "可选服务形式" : "Scope options" },
          { type: "paragraph", text: text.options },
          { type: "heading", text: locale === "zh" ? "报价前需要确认" : "Before a quotation" },
          { type: "paragraph", text: text.quotation },
          { type: "heading", text: locale === "zh" ? "组合建议" : "Possible combinations" },
          { type: "paragraph", text: text.combinations },
          {
            type: "heading",
            text: locale === "zh" ? "资源与发布准备" : "Resources and publication readiness",
          },
          { type: "paragraph", text: planning },
          {
            type: "paragraph",
            text:
              locale === "zh"
                ? "所有咨询由华伴统一承接。咨询不等于预订，具体履约方、签约及收款方、范围、档期与费用须在书面方案中确认。"
                : "Hua handles all enquiries. An enquiry is not a booking. Confirm delivery, contracting and payment parties, scope, availability and charges in the written proposal.",
          },
        ],
        catalog: {
          ...emptyCatalog(),
          categories: project.categories,
          cities: [],
          languages: ["zh", "en"],
          audience: text.audience,
          includes: text.includes,
          excludes: text.excludes,
          process: text.process,
          deliverables: text.deliverables,
          materials: text.materials,
          bookingNotice: text.bookingNotice,
          duration: text.duration,
          people: text.people,
          changes: text.changes,
          guideKeys: project.guides.map((slug) => "knowledge-" + slug),
          price: { mode: "quote" },
          fulfillment: "arranged",
          providerKeys: [],
        },
      } satisfies ContentBody;
    }),
  );
}
