---
layout: post
title: "React Hooks 완전 정복 — useState부터 Custom Hook까지"
subtitle: "useEffect 의존성 배열 함정, useMemo 남용 경계, 커스텀 훅 설계 원칙"
date: 2026-04-01
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
catalog: true
series: "React"
tags:
  - React
  - JavaScript
  - Frontend
categories:
  - react
description: "React Hooks 완전 정복. useState 비동기 업데이트, useEffect 의존성 배열 함정, useMemo 남용 경계, Custom Hook 설계 원칙까지 실전 패턴과 주의사항을 정리합니다."
---

## Class에서 Hooks로

React 16.8 이전에는 상태 관리와 생명주기 로직을 사용하려면 반드시 클래스 컴포넌트를 작성해야 했다.

```jsx
class Counter extends React.Component {
  constructor(props) {
    super(props);
    this.state = { count: 0 };
    this.handleClick = this.handleClick.bind(this);
  }

  componentDidMount() {
    document.title = `클릭: ${this.state.count}`;
  }

  componentDidUpdate() {
    document.title = `클릭: ${this.state.count}`;
  }

  handleClick() {
    this.setState({ count: this.state.count + 1 });
  }

  render() {
    return <button onClick={this.handleClick}>{this.state.count}</button>;
  }
}
```

문제는 명확했다:

- **this 바인딩**: 매번 `.bind(this)`를 하거나 화살표 함수를 써야 한다
- **로직 분산**: 같은 관심사의 코드가 `componentDidMount`, `componentDidUpdate`, `componentWillUnmount`에 흩어진다
- **재사용 어려움**: 상태 로직을 공유하려면 HOC나 render props 패턴이 필요한데 "wrapper hell"을 만든다

Hooks는 이 문제를 **함수 컴포넌트 안에서 상태와 생명주기를 사용할 수 있게** 해서 해결했다.

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    document.title = `클릭: ${count}`;
  }, [count]);

  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

코드가 절반으로 줄었고, 관련 로직이 한 곳에 모였다.

---

## useState: 상태 관리의 기본

### 기본 사용법

```jsx
const [value, setValue] = useState(initialValue);
```

### 핵심 1: 상태 업데이트는 비동기다

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  const handleClick = () => {
    setCount(count + 1);
    setCount(count + 1);
    setCount(count + 1);
    console.log(count); // 여전히 0 — 즉시 반영되지 않는다
  };
  // 결과: count는 1이 된다 (3이 아님!)
}
```

세 번 호출해도 `count`는 같은 클로저 값(0)을 참조하므로 `setCount(0 + 1)`이 세 번 실행될 뿐이다.

### 핵심 2: 함수형 업데이트

이전 상태를 기반으로 업데이트할 때는 **함수형 업데이트**를 사용한다:

```jsx
const handleClick = () => {
  setCount(prev => prev + 1);
  setCount(prev => prev + 1);
  setCount(prev => prev + 1);
  // 결과: count는 3이 된다 ✅
};
```

`prev`는 항상 최신 상태를 보장하므로 연속 업데이트가 올바르게 누적된다.

### 핵심 3: 객체 상태는 불변하게

```jsx
const [user, setUser] = useState({ name: '김도윤', age: 25 });

// ❌ 잘못된 방법 — 직접 변경
user.age = 26;
setUser(user); // React가 변경을 감지하지 못함 (같은 참조)

// ✅ 올바른 방법 — 새 객체 생성
setUser(prev => ({ ...prev, age: 26 }));
```

React는 **참조 비교**(Object.is)로 상태 변경을 감지한다. 같은 객체 참조를 전달하면 리렌더링이 발생하지 않는다.

---

## useEffect: 부수 효과 관리

### 기본 구조

```jsx
useEffect(() => {
  // 실행할 부수 효과
  return () => {
    // cleanup 함수 (선택)
  };
}, [dependencies]);
```

의존성 배열에 따라 실행 시점이 달라진다:

| 의존성 배열 | 실행 시점 |
|-------------|-----------|
| 생략 | 매 렌더링마다 |
| `[]` (빈 배열) | 마운트 시 1번 |
| `[a, b]` | a 또는 b가 변경될 때 |

### 함정 1: 빈 의존성 배열에서 stale closure

```jsx
function Timer() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      console.log(count); // 항상 0 — stale closure!
      setCount(count + 1); // 항상 0 + 1 = 1
    }, 1000);
    return () => clearInterval(id);
  }, []); // count를 의존성에 넣지 않았다
}
```

`[]`을 전달하면 effect는 마운트 시점의 `count`(0)를 영원히 참조한다. 해결 방법:

```jsx
// 방법 1: 함수형 업데이트
setCount(prev => prev + 1);

// 방법 2: 의존성 배열에 추가 (단, 매번 재실행됨)
useEffect(() => { ... }, [count]);

// 방법 3: useRef로 최신 값 추적
const countRef = useRef(count);
countRef.current = count;
```

### 함정 2: 객체/배열 의존성

```jsx
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  
  // ⚠️ options가 매 렌더링마다 새 객체 → effect 무한 실행
  const options = { includeDetails: true };

  useEffect(() => {
    fetchUser(userId, options).then(setUser);
  }, [userId, options]); // options는 매번 새 참조!
}
```

객체와 배열은 매 렌더링마다 새 참조가 만들어진다. 해결:

```jsx
// 방법 1: 의존성을 원시 값으로 분해
useEffect(() => {
  fetchUser(userId, { includeDetails: true }).then(setUser);
}, [userId]);

// 방법 2: useMemo로 참조 안정화
const options = useMemo(() => ({ includeDetails: true }), []);
```

### Cleanup 함수의 중요성

```jsx
useEffect(() => {
  const ws = new WebSocket('wss://api.example.com/feed');
  ws.onmessage = (event) => setMessages(prev => [...prev, event.data]);

  return () => {
    ws.close(); // 컴포넌트 언마운트 시 연결 종료
  };
}, []);
```

cleanup을 빠뜨리면 **메모리 누수**가 발생한다. 구독, 타이머, WebSocket, 이벤트 리스너는 반드시 cleanup에서 정리하자.

### 흔한 실수: useEffect 안에서 상태 설정 → 무한 루프

```jsx
// ❌ 무한 루프
useEffect(() => {
  setCount(count + 1); // 상태 변경 → 리렌더링 → effect 재실행 → ...
});

// ❌ 미묘한 무한 루프
useEffect(() => {
  setItems([...items, newItem]); // items가 변경 → effect 재실행
}, [items]);
```

---

## useCallback과 useMemo: 최적화, 그러나 신중하게

### useMemo — 값 메모이제이션

```jsx
const sortedList = useMemo(() => {
  return [...items].sort((a, b) => a.price - b.price);
}, [items]);
```

`items`가 변경되지 않으면 정렬을 다시 수행하지 않는다.

### useCallback — 함수 메모이제이션

```jsx
const handleSubmit = useCallback((data) => {
  api.post('/users', data);
}, []);
```

`useCallback(fn, deps)`는 사실 `useMemo(() => fn, deps)`와 동일하다. 함수 자체의 참조를 안정화한다.

### 언제 써야 하는가

```jsx
// ✅ 사용이 정당한 경우
// 1. React.memo로 감싼 자식에게 전달하는 콜백
const MemoChild = React.memo(({ onClick }) => <button onClick={onClick}>Click</button>);

function Parent() {
  const handleClick = useCallback(() => {
    console.log('clicked');
  }, []);
  return <MemoChild onClick={handleClick} />;
}

// 2. useEffect 의존성에 들어가는 함수
const fetchData = useCallback(() => {
  return api.get(`/users/${userId}`);
}, [userId]);

useEffect(() => {
  fetchData().then(setData);
}, [fetchData]);

// 3. 비용이 큰 계산
const result = useMemo(() => {
  return heavyComputation(data); // 수만 건 데이터 처리
}, [data]);
```

### 남용하지 말 것

```jsx
// ❌ 불필요한 useMemo — 단순 계산
const fullName = useMemo(() => `${firstName} ${lastName}`, [firstName, lastName]);
// 그냥 이렇게 쓰면 된다:
const fullName = `${firstName} ${lastName}`;

// ❌ 불필요한 useCallback — memo된 자식에게 전달하지 않는 콜백
const handleClick = useCallback(() => {
  setCount(c => c + 1);
}, []);
// 자식이 React.memo가 아니면 어차피 리렌더링된다
```

**useMemo/useCallback 자체도 비용이 있다.** 의존성 배열 비교, 이전 값 캐싱 등의 오버헤드가 발생한다. 단순한 연산에 적용하면 오히려 성능이 나빠진다. **"측정 후 최적화"**가 원칙이다.

---

## useRef: DOM 접근과 뮤터블 값

### DOM 접근

```jsx
function TextInput() {
  const inputRef = useRef(null);

  const focusInput = () => {
    inputRef.current.focus();
  };

  return (
    <>
      <input ref={inputRef} type="text" />
      <button onClick={focusInput}>포커스</button>
    </>
  );
}
```

### 렌더링과 무관한 뮤터블 값 저장

`useRef`는 `.current`를 변경해도 **리렌더링을 트리거하지 않는다**. 이 특성을 활용해 렌더링 사이에 값을 유지하면서도 리렌더링을 피할 수 있다.

```jsx
function StopWatch() {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);

  const start = () => {
    intervalRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
  };

  const stop = () => {
    clearInterval(intervalRef.current);
  };

  return (
    <div>
      <span>{elapsed}초</span>
      <button onClick={start}>시작</button>
      <button onClick={stop}>정지</button>
    </div>
  );
}
```

### 이전 상태 값 추적

```jsx
function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

function Counter() {
  const [count, setCount] = useState(0);
  const prevCount = usePrevious(count);
  return <p>현재: {count}, 이전: {prevCount}</p>;
}
```

---

## Custom Hook: 로직 재사용의 핵심

Custom Hook은 `use`로 시작하는 함수로, 내부에서 다른 Hook을 조합해 재사용 가능한 상태 로직을 캡슐화한다.

### useFetch — API 호출 추상화

```jsx
function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetch(url, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch(err => {
        if (err.name !== 'AbortError') setError(err);
      })
      .finally(() => setLoading(false));

    return () => controller.abort(); // cleanup: 컴포넌트 언마운트 시 요청 취소
  }, [url]);

  return { data, loading, error };
}

// 사용
function UserList() {
  const { data: users, loading, error } = useFetch('/api/users');

  if (loading) return <p>로딩 중...</p>;
  if (error) return <p>에러: {error.message}</p>;
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

### useLocalStorage — localStorage와 상태 동기화

```jsx
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored !== null ? JSON.parse(stored) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

// 사용
function Settings() {
  const [theme, setTheme] = useLocalStorage('theme', 'light');
  return (
    <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      현재 테마: {theme}
    </button>
  );
}
```

### useDebounce — 입력 디바운스

```jsx
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

// 사용: 검색 입력 디바운스
function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery) {
      searchApi(debouncedQuery).then(setResults);
    }
  }, [debouncedQuery]);

  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}
```

Custom Hook 설계 원칙:

1. **하나의 관심사에 집중** — useFetch는 API 호출만, useLocalStorage는 로컬 저장소만
2. **반환 값은 사용처에 맞게** — 단일 값이면 값 자체를, 여러 값이면 객체로
3. **cleanup을 잊지 말 것** — 타이머, 구독, 요청 취소
4. **Hook 규칙을 준수** — 내부에서 다른 Hook을 조건부로 호출하지 않기

---

## Hook의 규칙과 그 이유

### 규칙 1: 최상위에서만 호출

```jsx
// ❌ 조건문 안에서 호출
if (isLoggedIn) {
  const [user, setUser] = useState(null); // 금지!
}

// ❌ 반복문 안에서 호출
for (const item of items) {
  useEffect(() => { ... }); // 금지!
}

// ✅ 항상 컴포넌트/Hook 최상위에서 호출
const [user, setUser] = useState(null);
const [items, setItems] = useState([]);
```

**이유:** React는 Hook을 **호출 순서**로 식별한다. 내부적으로 Hook 상태를 배열(또는 연결 리스트)로 관리하며, 매 렌더링마다 같은 순서로 호출되어야 올바른 상태를 매칭할 수 있다. 조건부 호출은 순서를 깨뜨린다.

```
// 첫 렌더링:  useState(0) → useEffect → useState('')
//              Hook #0       Hook #1      Hook #2
//
// isLoggedIn이 false가 되면:
// 두번째 렌더링: useEffect → useState('')
//                Hook #0(!!!)  Hook #1(!!!)
// → Hook #0이 useState가 아닌 useEffect와 매칭 → 💥
```

### 규칙 2: React 함수 안에서만 호출

```jsx
// ❌ 일반 함수에서 호출
function formatData(data) {
  const [formatted, setFormatted] = useState(data); // 금지!
}

// ✅ React 컴포넌트에서 호출
function DataDisplay({ data }) {
  const [formatted, setFormatted] = useState(data);
}

// ✅ Custom Hook에서 호출
function useFormattedData(data) {
  const [formatted, setFormatted] = useState(data);
  return formatted;
}
```

ESLint 플러그인 `eslint-plugin-react-hooks`를 설치하면 이 규칙 위반을 빌드 시점에 잡아준다:

```bash
npm install eslint-plugin-react-hooks --save-dev
```

```json
{
  "plugins": ["react-hooks"],
  "rules": {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn"
  }
}
```

---

## 마무리

Hook은 단순한 API 변경이 아니라 **React의 사고방식 자체를 바꾼 전환점**이었다. 생명주기 중심에서 동기화 중심으로, 상속 기반에서 합성 기반으로의 전환이다.

핵심 정리:

| Hook | 용도 | 주의점 |
|------|------|--------|
| `useState` | 상태 관리 | 비동기 업데이트, 객체 불변성 |
| `useEffect` | 부수 효과 | 의존성 배열, cleanup, stale closure |
| `useCallback` | 함수 메모이제이션 | React.memo와 함께 써야 의미 있음 |
| `useMemo` | 값 메모이제이션 | 측정 후 적용, 단순 계산에 남용 금지 |
| `useRef` | DOM 접근 / 뮤터블 값 | 변경해도 리렌더링 안 됨 |
| Custom Hook | 로직 재사용 | use 접두사, Hook 규칙 준수 |

클래스 컴포넌트를 억지로 Hook으로 바꿀 필요는 없다. 하지만 새 코드를 작성한다면 Hook이 기본이다. 공식 문서에서도 함수 컴포넌트 + Hook을 권장하고 있으며, React의 최신 기능(Server Components, Suspense 등)도 함수 컴포넌트를 전제로 설계되고 있다.
