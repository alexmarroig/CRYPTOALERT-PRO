import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const TEST_PROFILE = (__ENV.TEST_PROFILE || 'load').toLowerCase();

const stageProfiles = {
  load: [
    { duration: '2m', target: 25 },
    { duration: '5m', target: 25 },
    { duration: '2m', target: 0 }
  ],
  stress: [
    { duration: '2m', target: 30 },
    { duration: '4m', target: 80 },
    { duration: '4m', target: 150 },
    { duration: '2m', target: 0 }
  ],
  soak: [
    { duration: '10m', target: 20 },
    { duration: '50m', target: 20 },
    { duration: '10m', target: 0 }
  ]
};

const selectedStages = stageProfiles[TEST_PROFILE] || stageProfiles.load;
const defaultHeaders = AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};

export const options = {
  discardResponseBodies: true,
  stages: selectedStages,
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    'http_req_duration{route:news}': ['p(95)<400', 'p(99)<800'],
    'http_req_duration{route:alerts}': ['p(95)<500', 'p(99)<900'],
    'http_req_duration{route:portfolio}': ['p(95)<650', 'p(99)<1200'],
    route_fail_rate: ['rate<0.03']
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)']
};

const routeFailRate = new Rate('route_fail_rate');

const routes = [
  {
    name: 'news',
    path: '/v1/news?limit=20',
    expectedStatuses: [200]
  },
  {
    name: 'alerts',
    path: '/v1/alerts?status=open&limit=20',
    expectedStatuses: [200, 401]
  },
  {
    name: 'portfolio',
    path: '/v1/portfolio/me',
    expectedStatuses: [200, 401]
  }
];

function requestRoute(route) {
  const response = http.get(`${BASE_URL}${route.path}`, {
    headers: defaultHeaders,
    tags: {
      route: route.name,
      profile: TEST_PROFILE
    }
  });

  const success = check(response, {
    [`${route.name} status is expected`]: (res) => route.expectedStatuses.includes(res.status)
  });

  routeFailRate.add(!success, { route: route.name, profile: TEST_PROFILE });
}

export default function run() {
  for (const route of routes) {
    requestRoute(route);
    sleep(0.5);
  }
}
