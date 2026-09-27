// UX 목업 전용 합성 데이터. 실제 채용 정보가 아니다 (docs/ux/design-handoff.md §5).
// 실제 제품 연결 시 이 파일은 서버 조회 결과로 대체된다.

export const DEMO_NOW = "2026-10-06T10:00:00+09:00";
/** V1~V3 재방문 변형을 켜면 이틀 뒤 다시 들어온 상황으로 본다. */
export const REVISIT_NOW = "2026-10-08T10:00:00+09:00";

export type SourceName = "사람인" | "잡코리아" | "인크루트";
export type Pay =
  | { kind: "monthly" | "annual"; min: number; max?: number; text: string }
  | { kind: "unknown"; text: string };
export type StatusKind = "open" | "closed" | "delayed" | "unknown";
export type Availability = StatusKind | "deadline_elapsed";
export type Qual = {
  label: string;
  ev?: string;
  skill?: string;
  career?: { years: number; field: string; related: string[] };
};
export type SourceRef = {
  name: SourceName;
  ref: string;
  url: string;
  verifiedAt: string | null;
  pay?: Pay;
};
export type Sentence = { id: string; text: string };
export type EvidenceKey =
  | "region"
  | "employment"
  | "career"
  | "workDays"
  | "remote"
  | "pay"
  | "deadline"
  | "start"
  | "status";

export type Posting = {
  id: string;
  version: number;
  company: string;
  title: string;
  /** 공고에 적힌 실제 업무 한 줄. 본문이 없으면 null. */
  summary: string | null;
  region: string | null;
  employment: "인턴" | "정규직" | null;
  career: {
    level: "any" | "entry" | "experienced";
    min?: number;
    max?: number;
    text: string;
  } | null;
  workDays: number | null;
  workText: string | null;
  remoteDays: number | null;
  remoteText: string | null;
  duration: string | null;
  startText: string | null;
  startDate?: string;
  pay: Pay;
  deadline: string | null;
  status: { kind: StatusKind; checkedAt: string | null; lastOkAt?: string };
  sources: SourceRef[];
  /** 동일 모집으로 묶은 근거. 근거가 없으면 묶지 않는다. */
  sameProof?: string;
  applyUrl?: string;
  tags: string[];
  tasks: { text: string; ev: string }[];
  required: Qual[];
  preferred: Qual[];
  connect?: { keywords: string[]; note: string };
  body: Sentence[] | null;
  bodyNote?: string;
  listSeenAt?: string;
  evidence: Partial<Record<EvidenceKey, string>>;
};

const at = (day: string, time: string) => `2026-${day}T${time}:00+09:00`;
const url = (id: string) => `https://example.com/jobs/${id}`;

const F01: Posting = {
  id: "F01",
  version: 1,
  company: "솔담리서치",
  title: "산업 리서치 인턴",
  summary: "산업 자료 조사와 고객 인터뷰 내용을 정리합니다.",
  region: "서울",
  employment: "인턴",
  career: { level: "any", text: "경력 무관" },
  workDays: 3,
  workText: "주 3일",
  remoteDays: null,
  remoteText: null,
  duration: "3개월",
  startText: "11월 2일 시작",
  startDate: "2026-11-02",
  pay: { kind: "monthly", min: 160, max: 160, text: "월 160만원" },
  deadline: "2026-10-22",
  status: { kind: "open", checkedAt: at("10-06", "09:00") },
  sources: [
    {
      name: "인크루트",
      ref: "F01",
      url: url("F01"),
      verifiedAt: at("10-06", "09:00"),
    },
  ],
  tags: ["리서치", "산업 조사"],
  tasks: [
    { text: "산업 자료 조사", ev: "b2" },
    { text: "고객 인터뷰 내용 정리", ev: "b2" },
    { text: "시장 리포트 작성 보조", ev: "b3" },
  ],
  required: [
    { label: "자료를 읽고 정리하는 능력", skill: "자료 정리", ev: "b5" },
  ],
  preferred: [{ label: "스프레드시트 사용 경험", ev: "b5" }],
  connect: {
    keywords: ["자료", "조사", "정리", "리서치"],
    note: "자료를 조사하고 정리해 본 경험과 업무가 연결돼요",
  },
  body: [
    {
      id: "b1",
      text: "솔담리서치는 산업·시장 리서치 보고서를 만드는 회사입니다.",
    },
    {
      id: "b2",
      text: "재학생·휴학생 지원 가능. 주 3일 근무하며 산업 조사와 고객 인터뷰 내용을 정리합니다.",
    },
    {
      id: "b3",
      text: "시장 리포트를 만드는 과정에서 자료 수집과 표 정리를 보조합니다.",
    },
    {
      id: "b4",
      text: "인턴 기간은 3개월이며 11월 2일에 시작합니다. 급여는 월 160만원입니다.",
    },
    {
      id: "b5",
      text: "자료를 읽고 정리하는 능력이 필요하며, 스프레드시트 사용 경험이 있으면 우대합니다.",
    },
    { id: "b6", text: "근무지: 서울 · 접수 마감: 2026년 10월 22일" },
  ],
  evidence: {
    region: "b6",
    employment: "b4",
    career: "b2",
    workDays: "b2",
    pay: "b4",
    deadline: "b6",
    start: "b4",
  },
};

/** V1: 저장 이후 근무일·마감이 바뀐 F01 두 번째 버전. */
const F01_V2: Posting = {
  ...F01,
  version: 2,
  workDays: 5,
  workText: "주 5일",
  deadline: "2026-10-12",
  status: { kind: "open", checkedAt: at("10-08", "09:00") },
  sources: [{ ...F01.sources[0], verifiedAt: at("10-08", "09:00") }],
  body: F01.body!.map((s) =>
    s.id === "b2"
      ? {
          ...s,
          text: "재학생·휴학생 지원 가능. 주 5일 근무하며 산업 조사와 고객 인터뷰 내용을 정리합니다.",
        }
      : s.id === "b6"
        ? { ...s, text: "근무지: 서울 · 접수 마감: 2026년 10월 12일" }
        : s,
  ),
};

const F02: Posting = {
  id: "F02",
  version: 1,
  company: "이음브릿지",
  title: "사업지원 인턴",
  summary: "시장 동향을 조사하고 영업 제안 자료 작성을 보조합니다.",
  region: "서울",
  employment: "인턴",
  career: { level: "any", text: "경력 무관" },
  workDays: null,
  workText: null,
  remoteDays: null,
  remoteText: null,
  duration: "3개월",
  startText: "시작일 협의",
  pay: { kind: "unknown", text: "공고에 없음" },
  deadline: "2026-10-18",
  status: { kind: "open", checkedAt: at("10-06", "09:10") },
  sources: [
    {
      name: "잡코리아",
      ref: "F02",
      url: url("F02"),
      verifiedAt: at("10-06", "09:10"),
    },
  ],
  tags: ["사업지원", "리서치", "시장 조사"],
  tasks: [
    { text: "시장 동향 조사", ev: "b2" },
    { text: "영업 제안 자료 정리", ev: "b3" },
    { text: "내부 자료 관리", ev: "b3" },
  ],
  required: [{ label: "문서 작성 능력", skill: "문서 작성", ev: "b4" }],
  preferred: [{ label: "산업 리서치 경험", ev: "b4" }],
  connect: {
    keywords: ["조사", "리서치", "시장"],
    note: "자료를 조사해 본 경험을 시장 동향 조사 업무에 살릴 수 있어요",
  },
  body: [
    {
      id: "b1",
      text: "이음브릿지는 기업 간 제휴와 영업을 지원하는 회사입니다.",
    },
    {
      id: "b2",
      text: "3개월 인턴을 모집합니다. 시장 동향 조사와 제안 자료 작성을 보조합니다.",
    },
    { id: "b3", text: "영업 제안 자료를 정리하고 내부 자료를 관리합니다." },
    {
      id: "b4",
      text: "문서 작성에 익숙한 분을 찾으며, 산업 리서치 경험이 있으면 우대합니다.",
    },
    {
      id: "b5",
      text: "근무지: 서울 · 시작일은 협의 · 접수 마감: 2026년 10월 18일",
    },
  ],
  evidence: { region: "b5", employment: "b2", start: "b5", deadline: "b5" },
};

const F03: Posting = {
  id: "F03",
  version: 1,
  company: "모아커머스",
  title: "데이터 분석 신입",
  summary: "SQL로 지표를 추출하고 대시보드를 관리합니다.",
  region: "서울",
  employment: "정규직",
  career: { level: "entry", text: "신입 지원 가능" },
  workDays: 5,
  workText: "주 5일",
  remoteDays: 0,
  remoteText: "주 5일 출근",
  duration: null,
  startText: null,
  pay: { kind: "annual", min: 3500, max: 3500, text: "연 3,500만원" },
  deadline: "2026-10-20",
  status: { kind: "open", checkedAt: at("10-06", "09:25") },
  sources: [
    {
      name: "사람인",
      ref: "F03",
      url: url("F03"),
      verifiedAt: at("10-06", "09:20"),
    },
    {
      name: "인크루트",
      ref: "F11",
      url: url("F11"),
      verifiedAt: at("10-06", "09:25"),
    },
  ],
  sameProof: "공통 채용 식별자 DEMO-MOA-DA-01과 같은 신청 링크",
  applyUrl: "https://example.com/apply/DEMO-MOA-DA-01",
  tags: ["데이터 분석", "데이터"],
  tasks: [
    { text: "SQL로 지표 추출", ev: "b2" },
    { text: "대시보드 관리", ev: "b2" },
    { text: "분석 결과 공유", ev: "b4" },
  ],
  required: [{ label: "SQL 활용 경험", skill: "SQL", ev: "b3" }],
  preferred: [{ label: "Python", ev: "b3" }],
  connect: {
    keywords: ["SQL", "데이터 분석", "분석했"],
    note: "SQL로 데이터를 분석해 본 경험과 업무가 연결돼요",
  },
  body: [
    { id: "b1", text: "모아커머스는 생활용품 온라인 쇼핑몰을 운영합니다." },
    {
      id: "b2",
      text: "신입 지원 가능. SQL로 지표를 추출하고 대시보드를 관리합니다.",
    },
    { id: "b3", text: "SQL 활용 경험은 필수이며 Python은 우대합니다." },
    { id: "b4", text: "분석 결과를 정리해 사업 부서와 공유합니다." },
    { id: "b5", text: "근무지: 서울 · 정규직 · 주 5일 출근 · 연봉 3,500만원" },
    {
      id: "b6",
      text: "접수 마감: 2026년 10월 20일 · 채용 식별자 DEMO-MOA-DA-01",
    },
  ],
  evidence: {
    region: "b5",
    employment: "b5",
    career: "b2",
    workDays: "b5",
    remote: "b5",
    pay: "b5",
    deadline: "b6",
  },
};

const F04: Posting = {
  id: "F04",
  version: 1,
  company: "리프워크",
  title: "고객 데이터 운영",
  summary: "Excel로 고객 데이터를 정리하고 운영 지표 리포트를 만듭니다.",
  region: "서울",
  employment: "정규직",
  career: { level: "entry", text: "신입 지원 가능" },
  workDays: 5,
  workText: "주 5일",
  remoteDays: 2,
  remoteText: "주 2일 재택",
  duration: null,
  startText: null,
  pay: { kind: "unknown", text: "급여 협의" },
  deadline: "2026-10-24",
  status: { kind: "open", checkedAt: at("10-06", "09:30") },
  sources: [
    {
      name: "잡코리아",
      ref: "F04",
      url: url("F04"),
      verifiedAt: at("10-06", "09:30"),
    },
  ],
  tags: ["데이터 운영", "고객 데이터", "데이터"],
  tasks: [
    { text: "고객 데이터 정리", ev: "b2" },
    { text: "운영 지표 리포트 작성", ev: "b4" },
    { text: "반복 업무 프로세스 개선", ev: "b4" },
  ],
  required: [{ label: "Excel 활용", skill: "Excel", ev: "b2" }],
  preferred: [{ label: "SQL 사용 경험", ev: "b3" }],
  connect: {
    keywords: ["고객 데이터", "Excel", "엑셀", "데이터를 정리"],
    note: "고객 데이터 정리·운영 지표 업무가 입력한 경험과 연결돼요",
  },
  body: [
    { id: "b1", text: "리프워크는 기업용 업무 관리 서비스를 운영합니다." },
    { id: "b2", text: "Excel을 사용해 고객 데이터를 정리합니다." },
    {
      id: "b3",
      text: "SQL 사용 경험은 우대하며 주 2일 재택근무가 가능합니다.",
    },
    {
      id: "b4",
      text: "운영 지표 리포트를 만들고 반복 업무의 개선점을 찾습니다.",
    },
    {
      id: "b5",
      text: "근무지: 서울 · 정규직 · 신입 지원 가능 · 주 5일 근무 · 급여는 협의합니다.",
    },
    { id: "b6", text: "접수 마감: 2026년 10월 24일" },
  ],
  evidence: {
    region: "b5",
    employment: "b5",
    career: "b5",
    workDays: "b5",
    remote: "b3",
    pay: "b5",
    deadline: "b6",
  },
};

const F05: Posting = {
  id: "F05",
  version: 1,
  company: "노바메트릭스",
  title: "데이터 엔지니어",
  summary: "물류 데이터 파이프라인을 개발하고 운영합니다.",
  region: "부산",
  employment: "정규직",
  career: { level: "experienced", min: 3, text: "동일 업무 3년 이상" },
  workDays: 5,
  workText: "주 5일",
  remoteDays: 0,
  remoteText: "주 5일 출근",
  duration: null,
  startText: null,
  pay: { kind: "annual", min: 5000, text: "연 5,000만원 이상" },
  deadline: "2026-10-28",
  status: { kind: "open", checkedAt: at("10-06", "09:40") },
  sources: [
    {
      name: "사람인",
      ref: "F05",
      url: url("F05"),
      verifiedAt: at("10-06", "09:40"),
    },
  ],
  tags: ["데이터 엔지니어링", "데이터"],
  tasks: [
    { text: "데이터 파이프라인 개발", ev: "b3" },
    { text: "데이터 파이프라인 운영", ev: "b3" },
  ],
  required: [
    {
      label: "데이터 엔지니어링 실무 경력 3년 이상",
      career: {
        years: 3,
        field: "데이터 엔지니어링",
        related: ["데이터 엔지니어링", "데이터 엔지니어"],
      },
      ev: "b2",
    },
  ],
  preferred: [{ label: "클라우드 운영 경험", ev: "b3" }],
  body: [
    { id: "b1", text: "노바메트릭스는 물류 데이터 플랫폼을 개발합니다." },
    {
      id: "b2",
      text: "부산 근무이며 데이터 엔지니어링 실무 경력 3년 이상이 필수입니다.",
    },
    {
      id: "b3",
      text: "데이터 파이프라인을 개발하고 운영합니다. 클라우드 운영 경험을 우대합니다.",
    },
    {
      id: "b4",
      text: "주 5일 출근 · 연봉 5,000만원 이상 · 접수 마감: 2026년 10월 28일",
    },
  ],
  bodyNote:
    "복리후생 안내는 이미지로 게시되어 있어 텍스트를 확보하지 못했어요. 해당 내용은 요약과 준비 프롬프트에 넣지 않았어요.",
  evidence: {
    region: "b2",
    career: "b2",
    workDays: "b4",
    remote: "b4",
    pay: "b4",
    deadline: "b4",
  },
};

const F06: Posting = {
  id: "F06",
  version: 1,
  company: "리듬소프트",
  title: "프로덕트 운영 매니저",
  summary: "운영 지표를 분석하고 고객 피드백을 제품 개선으로 연결합니다.",
  region: "서울",
  employment: "정규직",
  career: { level: "experienced", min: 2, max: 5, text: "관련 경력 2~5년" },
  workDays: 5,
  workText: "주 5일",
  remoteDays: 2,
  remoteText: "주 2일 재택",
  duration: null,
  startText: null,
  pay: { kind: "annual", min: 5000, max: 6500, text: "연 5,000~6,500만원" },
  deadline: "2026-11-01",
  status: { kind: "open", checkedAt: at("10-06", "09:45") },
  sources: [
    {
      name: "잡코리아",
      ref: "F06",
      url: url("F06"),
      verifiedAt: at("10-06", "09:45"),
    },
  ],
  tags: ["제품 운영", "운영 지표 분석"],
  tasks: [
    { text: "제품 운영 지표 분석", ev: "b3" },
    { text: "고객 피드백 정리", ev: "b4" },
    { text: "제품 개선 협업", ev: "b4" },
  ],
  required: [
    {
      label: "관련 운영 경력 2년 이상",
      career: { years: 2, field: "운영", related: ["운영"] },
      ev: "b2",
    },
  ],
  preferred: [{ label: "분석 도구 사용 경험", ev: "b5" }],
  connect: {
    keywords: ["제품 운영", "운영"],
    note: "제품 운영 경험을 운영 지표 분석·제품 개선 업무에 살릴 수 있어요",
  },
  body: [
    { id: "b1", text: "리듬소프트는 음악 협업 소프트웨어를 만듭니다." },
    {
      id: "b2",
      text: "관련 경력 2~5년. 주 2일 재택근무, 연봉 5,000~6,500만원.",
    },
    { id: "b3", text: "제품 개선을 위한 운영 지표 분석을 담당합니다." },
    {
      id: "b4",
      text: "고객 피드백을 정리하고 제품팀과 개선 과제를 함께 진행합니다.",
    },
    {
      id: "b5",
      text: "분석 도구 사용 경험을 우대합니다. 근무지: 서울 · 주 5일 · 접수 마감: 2026년 11월 1일",
    },
  ],
  evidence: {
    region: "b5",
    career: "b2",
    workDays: "b5",
    remote: "b2",
    pay: "b2",
    deadline: "b5",
  },
};

const F07: Posting = {
  id: "F07",
  version: 1,
  company: "플로우랩",
  title: "서비스 운영 매니저",
  summary: "서비스 운영과 고객 이슈 분류, 개선 과제 관리를 맡습니다.",
  region: "서울",
  employment: "정규직",
  career: { level: "experienced", min: 2, max: 5, text: "관련 경력 2~5년" },
  workDays: 5,
  workText: "주 5일",
  remoteDays: null,
  remoteText: "재택 협의",
  duration: null,
  startText: null,
  pay: { kind: "unknown", text: "면접 후 결정" },
  deadline: null,
  status: { kind: "open", checkedAt: at("10-06", "09:50") },
  sources: [
    {
      name: "사람인",
      ref: "F07",
      url: url("F07"),
      verifiedAt: at("10-06", "09:50"),
    },
  ],
  tags: ["서비스 운영"],
  tasks: [
    { text: "서비스 운영", ev: "b3" },
    { text: "고객 이슈 분류", ev: "b3" },
    { text: "개선 과제 관리", ev: "b3" },
  ],
  required: [
    {
      label: "관련 운영 경력 2년 이상",
      career: { years: 2, field: "운영", related: ["운영"] },
      ev: "b2",
    },
  ],
  preferred: [],
  connect: {
    keywords: ["운영"],
    note: "운영 경험을 서비스 운영·개선 과제 관리에 살릴 수 있어요",
  },
  body: [
    { id: "b1", text: "플로우랩은 예약 관리 서비스를 운영합니다." },
    {
      id: "b2",
      text: "관련 경력 2~5년. 재택근무는 협의하며 처우는 면접 후 결정합니다.",
    },
    {
      id: "b3",
      text: "서비스 운영과 고객 이슈 분류, 개선 과제 관리를 맡습니다.",
    },
    { id: "b4", text: "근무지: 서울 · 정규직 · 주 5일" },
  ],
  evidence: {
    region: "b4",
    employment: "b4",
    career: "b2",
    workDays: "b4",
    remote: "b2",
    pay: "b2",
  },
};

const F08: Posting = {
  id: "F08",
  version: 1,
  company: "솔담리서치",
  title: "이전 기수 리서치 인턴",
  summary: "산업 조사와 인터뷰 정리를 담당한 이전 모집입니다.",
  region: "서울",
  employment: "인턴",
  career: { level: "any", text: "경력 무관" },
  workDays: 3,
  workText: "주 3일",
  remoteDays: null,
  remoteText: null,
  duration: null,
  startText: null,
  pay: { kind: "unknown", text: "공고에 없음" },
  deadline: "2026-09-30",
  status: { kind: "closed", checkedAt: at("10-06", "09:00") },
  sources: [
    {
      name: "인크루트",
      ref: "F08",
      url: url("F08"),
      verifiedAt: at("10-06", "09:00"),
    },
  ],
  tags: ["리서치"],
  tasks: [
    { text: "산업 조사", ev: "b2" },
    { text: "인터뷰 정리", ev: "b2" },
  ],
  required: [],
  preferred: [],
  body: [
    { id: "b1", text: "본 채용은 마감되었습니다." },
    {
      id: "b2",
      text: "산업 조사와 인터뷰 정리를 담당할 리서치 인턴을 모집했습니다. 주 3일 근무.",
    },
    { id: "b3", text: "접수 기간: 2026년 9월 30일까지" },
  ],
  evidence: { status: "b1", workDays: "b2", deadline: "b3" },
};

const F09: Posting = {
  id: "F09",
  version: 1,
  company: "이음브릿지",
  title: "단기 데이터 정리 인턴",
  summary: "2개월 동안 데이터 정리 업무를 보조합니다.",
  region: "서울",
  employment: "인턴",
  career: { level: "any", text: "경력 무관" },
  workDays: 5,
  workText: "주 5일",
  remoteDays: null,
  remoteText: null,
  duration: "2개월",
  startText: null,
  pay: { kind: "unknown", text: "공고에 없음" },
  deadline: "2026-10-05",
  status: { kind: "open", checkedAt: at("10-04", "09:00") },
  sources: [
    {
      name: "인크루트",
      ref: "F09",
      url: url("F09"),
      verifiedAt: at("10-04", "09:00"),
    },
  ],
  tags: ["데이터 정리", "데이터"],
  tasks: [{ text: "데이터 정리 보조", ev: "b1" }],
  required: [],
  preferred: [],
  body: [
    {
      id: "b1",
      text: "2개월 단기 인턴으로 데이터 정리 업무를 보조합니다. 주 5일 근무.",
    },
    { id: "b2", text: "근무지: 서울 · 접수 마감: 2026년 10월 5일." },
  ],
  evidence: { region: "b2", workDays: "b1", deadline: "b2" },
};

const F10: Posting = {
  id: "F10",
  version: 1,
  company: "모아커머스",
  title: "데이터 운영 신입",
  summary: "데이터 정리와 운영 지원 업무를 맡습니다.",
  region: "서울",
  employment: "정규직",
  career: { level: "entry", text: "신입 지원 가능" },
  workDays: 5,
  workText: "주 5일",
  remoteDays: null,
  remoteText: null,
  duration: null,
  startText: null,
  pay: { kind: "unknown", text: "공고에 없음" },
  deadline: null,
  status: {
    kind: "delayed",
    checkedAt: at("10-06", "09:55"),
    lastOkAt: at("09-28", "09:00"),
  },
  sources: [
    {
      name: "사람인",
      ref: "F10",
      url: url("F10"),
      verifiedAt: at("09-28", "09:00"),
    },
  ],
  tags: ["데이터 운영", "데이터"],
  tasks: [
    { text: "데이터 정리", ev: "b1" },
    { text: "운영 지원", ev: "b1" },
  ],
  required: [],
  preferred: [],
  body: [
    { id: "b1", text: "신입 지원 가능. 데이터 운영 지원 업무" },
    { id: "b2", text: "근무지: 서울 · 정규직 · 주 5일" },
  ],
  evidence: { region: "b2", employment: "b2", career: "b1", workDays: "b2" },
};

const F12: Posting = {
  id: "F12",
  version: 1,
  company: "이음브릿지",
  title: "운영 인턴",
  summary: null,
  region: "서울",
  employment: "인턴",
  career: { level: "any", text: "경력 무관" },
  workDays: null,
  workText: null,
  remoteDays: null,
  remoteText: null,
  duration: null,
  startText: null,
  pay: { kind: "unknown", text: "공고에 없음" },
  deadline: null,
  status: { kind: "unknown", checkedAt: null },
  sources: [
    { name: "잡코리아", ref: "F12", url: url("F12"), verifiedAt: null },
  ],
  tags: [],
  tasks: [],
  required: [],
  preferred: [],
  body: null,
  listSeenAt: at("10-06", "08:40"),
  evidence: {},
};

const BASE: Posting[] = [F01, F02, F03, F04, F05, F06, F07, F08, F09, F10, F12];

/** F11은 F03과 같은 모집으로 확인돼 F03 묶음의 두 번째 출처로 보여준다. */
export const ALIASES: Record<string, string> = { F11: "F03" };

export type Variant = "V1" | "V2" | "V3" | "V4" | "V5";

export const VARIANTS: { id: Variant; title: string; detail: string }[] = [
  {
    id: "V1",
    title: "내용 변경",
    detail: "F01이 주 3일·10/22 마감 → 주 5일·10/12 마감으로 바뀜",
  },
  {
    id: "V2",
    title: "재방문 시 마감",
    detail: "F03·F11 원문에서 마감이 확인됨",
  },
  {
    id: "V3",
    title: "갱신 실패",
    detail: "F06의 이후 확인이 실패함. 마지막 성공 기록은 유지",
  },
  {
    id: "V4",
    title: "출처 간 충돌",
    detail: "F06의 두 번째 출처에 연봉이 4,500~6,000만원으로 적힘",
  },
  {
    id: "V5",
    title: "경력직 범위 부족",
    detail: "경력직 공고(F06·F07)를 아직 확보하지 못한 상황",
  },
];

export function demoNow(variants: Variant[]) {
  return variants.some((v) => v === "V1" || v === "V2" || v === "V3")
    ? REVISIT_NOW
    : DEMO_NOW;
}

export function getPostings(variants: Variant[]): Posting[] {
  const on = (v: Variant) => variants.includes(v);
  return BASE.map((p) => {
    if (p.id === "F01" && on("V1")) return F01_V2;
    if (p.id === "F03" && on("V2"))
      return {
        ...p,
        status: { kind: "closed", checkedAt: at("10-08", "09:20") },
        sources: p.sources.map((s) => ({
          ...s,
          verifiedAt: at("10-08", "09:20"),
        })),
        body: [{ id: "b0", text: "본 채용은 마감되었습니다." }, ...p.body!],
        evidence: { ...p.evidence, status: "b0" },
      };
    if (p.id === "F06") {
      let next = p;
      if (on("V3"))
        next = {
          ...next,
          status: {
            kind: "delayed",
            checkedAt: at("10-08", "09:10"),
            lastOkAt: at("10-06", "09:45"),
          },
        };
      if (on("V4"))
        next = {
          ...next,
          sources: [
            { ...next.sources[0], pay: next.pay },
            {
              name: "사람인",
              ref: "F06-B",
              url: url("F06-B"),
              verifiedAt: at("10-06", "09:48"),
              pay: {
                kind: "annual",
                min: 4500,
                max: 6000,
                text: "연 4,500~6,000만원",
              },
            },
          ],
          sameProof: "같은 모집 ID DEMO-RHY-PO-02",
        };
      return next;
    }
    return p;
  });
}

export function findPosting(postings: Posting[], id: string) {
  const key = ALIASES[id] ?? id;
  return postings.find((p) => p.id === key) ?? null;
}

export function availability(p: Posting, now: string): Availability {
  if (p.status.kind !== "open") return p.status.kind;
  if (p.deadline && p.deadline < now.slice(0, 10)) return "deadline_elapsed";
  return "open";
}

/** 출처마다 보상 표기가 다르면 하나로 합치지 않는다 (X14). */
export function payConflict(p: Posting) {
  const pays = p.sources
    .map((s) =>
      s.pay?.kind !== undefined && s.pay.kind !== "unknown" ? s.pay.text : null,
    )
    .filter(Boolean);
  return new Set(pays).size > 1;
}

export const SOURCE_ROWS = BASE.reduce((n, p) => n + p.sources.length, 0);

/** 브라우저가 기억한 버전이 남아 있을 때만 비교한다. 없으면 가짜 차이를 만들지 않는다. */
const HISTORY: Record<string, Posting[]> = { F01: [F01, F01_V2] };

export function changesSince(p: Posting, seenVersion: number) {
  if (seenVersion >= p.version) return { kind: "same" as const, rows: [] };
  const before = HISTORY[p.id]?.find((v) => v.version === seenVersion);
  if (!before) return { kind: "unknown" as const, rows: [] };
  const fields: [string, (x: Posting) => string][] = [
    ["근무일", (x) => x.workText ?? "공고에 없음"],
    [
      "마감",
      (x) =>
        x.deadline
          ? `${x.deadline.slice(5, 7)}/${x.deadline.slice(8, 10)}`
          : "미기재",
    ],
    ["보상", (x) => x.pay.text],
    ["재택", (x) => x.remoteText ?? "공고에 없음"],
  ];
  const rows = fields
    .map(([label, get]) => ({ label, before: get(before), after: get(p) }))
    .filter((r) => r.before !== r.after);
  return { kind: "changed" as const, rows };
}
