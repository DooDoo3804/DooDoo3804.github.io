---
layout: post
title: "Spring Security 6 + JWT 인증 구현"
subtitle: "SecurityFilterChain부터 토큰 갱신 전략까지 — Spring Boot 3.x 실전 가이드"
date: "2026-04-01"
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
catalog: true
keywords: "spring security, jwt, authentication, refresh token, backend"
series: "Spring 심화"
tags:
  - Spring
  - Spring Security
  - JWT
  - Backend
categories:
  - spring
description: "Spring Security 6 + JWT 인증 구현 실전 가이드. SecurityFilterChain 설정, JwtTokenProvider 구현, Refresh Token 갱신 전략, 토큰 저장 보안까지 상세히 다룹니다."
---

## 들어가며

[이전 글(Spring Boot + JPA로 REST API 만들기)](/spring/2026/03/15/spring-boot-jpa-basics/)에서 기본적인 CRUD API를 구현했다. 이번에는 이 API에 **인증(Authentication)** 을 적용한다. 세션 기반 인증 대신 **JWT(JSON Web Token)** 를 사용해서 stateless한 인증 시스템을 만들 것이다.

Spring Security 6.x + Spring Boot 3.x 기준으로 작성했다. Spring Security 5.x 이하와 설정 방식이 상당히 다르니 주의하자.

---

## Spring Security 아키텍처 개요

Spring Security는 **서블릿 필터 체인** 기반으로 동작한다. 요청이 Controller에 도달하기 전에 여러 보안 필터를 거치게 된다. 아키텍처를 더 깊이 이해하려면 [Spring Security 아키텍처 완전 이해](/spring/2026/04/05/spring-security-architecture/)를 참고하자.

```
HTTP Request
    ↓
[DelegatingFilterProxy]
    ↓
[FilterChainProxy]
    ↓
[SecurityFilterChain]
    ├── DisableEncodeUrlFilter
    ├── SecurityContextHolderFilter
    ├── CsrfFilter
    ├── LogoutFilter
    ├── UsernamePasswordAuthenticationFilter  ← 우리가 대체할 부분
    ├── ExceptionTranslationFilter
    └── AuthorizationFilter
    ↓
DispatcherServlet → Controller
```

### 핵심 컴포넌트

- **SecurityFilterChain** — 어떤 URL 패턴에 어떤 필터/인가 규칙을 적용할지 정의
- **AuthenticationManager** — 인증 처리를 위임받는 핵심 인터페이스
- **AuthenticationProvider** — 실제 인증 로직 수행 (DB 조회, 비밀번호 검증 등)
- **UserDetailsService** — 사용자 정보를 로드하는 인터페이스
- **SecurityContextHolder** — 인증된 사용자 정보를 ThreadLocal에 저장

JWT 인증에서는 `UsernamePasswordAuthenticationFilter` 대신 **커스텀 JWT 필터**를 끼워 넣어서, 매 요청마다 토큰을 검증하고 SecurityContext에 인증 정보를 세팅한다.

---

## JWT 구조

JWT는 `.`으로 구분된 세 파트로 구성된다:

```
xxxxx.yyyyy.zzzzz
 ↑       ↑      ↑
Header  Payload  Signature
```

### Header

서명 알고리즘과 토큰 타입을 명시한다.

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

### Payload (Claims)

토큰에 담길 데이터. 표준 클레임과 커스텀 클레임이 있다.

```json
{
  "sub": "user@example.com",
  "iat": 1711900800,
  "exp": 1711987200,
  "roles": ["ROLE_USER"]
}
```

- `sub` (subject) — 사용자 식별자
- `iat` (issued at) — 발급 시각
- `exp` (expiration) — 만료 시각

### Signature

Header와 Payload를 인코딩한 값에 비밀키로 서명한다.

```
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret
)
```

### 서명 알고리즘

| 알고리즘 | 방식 | 키 | 사용 사례 |
|----------|------|-----|-----------|
| **HS256** | 대칭키 (HMAC) | 하나의 secret | 단일 서버, 간단한 구조 |
| **RS256** | 비대칭키 (RSA) | private/public key pair | MSA, 외부 검증 필요 시 |

HS256은 구현이 간단하지만, 검증하는 쪽도 비밀키를 알아야 한다. MSA 환경에서는 RS256이 더 적합하다 — 발급 서버만 private key를 갖고, 다른 서비스는 public key로 검증만 하면 된다.

---

## 의존성 추가

```groovy
// build.gradle
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-security'
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'

    // JWT (jjwt 0.12.x)
    implementation 'io.jsonwebtoken:jjwt-api:0.12.6'
    runtimeOnly    'io.jsonwebtoken:jjwt-impl:0.12.6'
    runtimeOnly    'io.jsonwebtoken:jjwt-jackson:0.12.6'

    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
    runtimeOnly 'com.h2database:h2'
}
```

---

## 구현

### 1. User Entity & Repository

```java
@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String password;

    @Enumerated(EnumType.STRING)
    private Role role;

    @Builder
    public User(String email, String password, Role role) {
        this.email = email;
        this.password = password;
        this.role = role;
    }
}

public enum Role {
    ROLE_USER,
    ROLE_ADMIN
}
```

```java
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
}
```

### 2. UserDetailsService 구현

Spring Security가 사용자 정보를 로드할 때 사용하는 인터페이스다.

```java
@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException("사용자를 찾을 수 없습니다: " + email));

        return org.springframework.security.core.userdetails.User.builder()
                .username(user.getEmail())
                .password(user.getPassword())
                .roles(user.getRole().name().replace("ROLE_", ""))
                .build();
    }
}
```

### 3. JwtTokenProvider

토큰 생성과 검증을 담당하는 핵심 클래스다.

```java
@Component
public class JwtTokenProvider {

    private final SecretKey secretKey;
    private final long accessTokenValidity;
    private final long refreshTokenValidity;

    public JwtTokenProvider(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.access-token-validity}") long accessTokenValidity,
            @Value("${jwt.refresh-token-validity}") long refreshTokenValidity) {
        this.secretKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(secret));
        this.accessTokenValidity = accessTokenValidity;
        this.refreshTokenValidity = refreshTokenValidity;
    }

    // Access Token 생성
    public String createAccessToken(Authentication authentication) {
        return createToken(authentication, accessTokenValidity);
    }

    // Refresh Token 생성
    public String createRefreshToken(Authentication authentication) {
        return createToken(authentication, refreshTokenValidity);
    }

    private String createToken(Authentication authentication, long validity) {
        String authorities = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.joining(","));

        Date now = new Date();
        Date expiry = new Date(now.getTime() + validity);

        return Jwts.builder()
                .subject(authentication.getName())
                .claim("roles", authorities)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(secretKey)
                .compact();
    }

    // 토큰에서 Authentication 객체 추출
    public Authentication getAuthentication(String token) {
        Claims claims = parseClaims(token);

        String roles = claims.get("roles", String.class);
        Collection<? extends GrantedAuthority> authorities =
                Arrays.stream(roles.split(","))
                        .map(SimpleGrantedAuthority::new)
                        .collect(Collectors.toList());

        UserDetails principal = new org.springframework.security.core.userdetails.User(
                claims.getSubject(), "", authorities);

        return new UsernamePasswordAuthenticationToken(principal, token, authorities);
    }

    // 토큰 유효성 검증
    public boolean validateToken(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
```

`application.yml` 설정:

```yaml
jwt:
  # 최소 256-bit(32바이트) 이상의 Base64 인코딩 키
  secret: "Y2xhdWRlLWNvZGUtc3ByaW5nLXNlY3VyaXR5LWp3dC1zZWNyZXQta2V5LTMyYg=="
  access-token-validity: 1800000   # 30분 (ms)
  refresh-token-validity: 604800000 # 7일 (ms)
```

### 4. JwtAuthenticationFilter

매 요청마다 `Authorization` 헤더에서 JWT를 추출하고, 유효하면 SecurityContext에 인증 정보를 세팅한다.

```java
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String token = resolveToken(request);

        if (token != null && jwtTokenProvider.validateToken(token)) {
            Authentication auth = jwtTokenProvider.getAuthentication(token);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        filterChain.doFilter(request, response);
    }

    private String resolveToken(HttpServletRequest request) {
        String bearer = request.getHeader("Authorization");
        if (bearer != null && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }
        return null;
    }
}
```

### 5. SecurityConfig

Spring Security 6.x에서는 `WebSecurityConfigurerAdapter`가 제거되었다. 대신 `SecurityFilterChain`을 `@Bean`으로 등록한다.

```java
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final CustomUserDetailsService userDetailsService;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // REST API이므로 CSRF 비활성화
            .csrf(csrf -> csrf.disable())

            // 세션 사용 안 함 (JWT는 stateless)
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            // URL별 인가 규칙
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )

            // JWT 필터를 UsernamePasswordAuthenticationFilter 앞에 추가
            .addFilterBefore(jwtAuthenticationFilter,
                UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

### 6. AuthController — 로그인 & 회원가입

```java
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider jwtTokenProvider;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @PostMapping("/signup")
    public ResponseEntity<String> signup(@RequestBody SignupRequest request) {
        if (userRepository.findByEmail(request.getEmail()).isPresent()) {
            return ResponseEntity.badRequest().body("이미 존재하는 이메일입니다.");
        }

        User user = User.builder()
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .role(Role.ROLE_USER)
                .build();

        userRepository.save(user);
        return ResponseEntity.status(HttpStatus.CREATED).body("회원가입 완료");
    }

    @PostMapping("/login")
    public ResponseEntity<TokenResponse> login(@RequestBody LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        request.getEmail(), request.getPassword()));

        String accessToken = jwtTokenProvider.createAccessToken(authentication);
        String refreshToken = jwtTokenProvider.createRefreshToken(authentication);

        return ResponseEntity.ok(new TokenResponse(accessToken, refreshToken));
    }
}
```

DTO 클래스:

```java
@Getter
@NoArgsConstructor
public class SignupRequest {
    private String email;
    private String password;
}

@Getter
@NoArgsConstructor
public class LoginRequest {
    private String email;
    private String password;
}

@Getter
@AllArgsConstructor
public class TokenResponse {
    private String accessToken;
    private String refreshToken;
}
```

---

## 로그인 플로우

전체 인증 흐름을 정리하면:

```
[회원가입]
POST /api/auth/signup { email, password }
    → PasswordEncoder.encode(password) → DB 저장

[로그인]
POST /api/auth/login { email, password }
    → AuthenticationManager.authenticate()
        → CustomUserDetailsService.loadUserByUsername()
        → BCrypt 비밀번호 검증
    → JwtTokenProvider.createAccessToken()
    → JwtTokenProvider.createRefreshToken()
    → { accessToken, refreshToken } 응답

[인증된 API 호출]
GET /api/posts (Authorization: Bearer <accessToken>)
    → JwtAuthenticationFilter.doFilterInternal()
        → resolveToken() → Bearer에서 토큰 추출
        → validateToken() → 서명 검증 + 만료 확인
        → getAuthentication() → SecurityContext에 세팅
    → Controller 정상 처리
```

---

## 토큰 갱신(Refresh) 전략

Access Token의 유효기간은 짧게 설정한다 (15~30분). 만료되면 Refresh Token으로 새 Access Token을 발급받는다.

```java
@PostMapping("/refresh")
public ResponseEntity<TokenResponse> refresh(@RequestBody RefreshRequest request) {
    String refreshToken = request.getRefreshToken();

    if (!jwtTokenProvider.validateToken(refreshToken)) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    }

    Authentication auth = jwtTokenProvider.getAuthentication(refreshToken);
    String newAccessToken = jwtTokenProvider.createAccessToken(auth);

    // Refresh Token은 재사용 (RTR 전략을 쓰려면 여기서 새로 발급)
    return ResponseEntity.ok(new TokenResponse(newAccessToken, refreshToken));
}
```

### RTR (Refresh Token Rotation) 전략

보안을 강화하려면 Refresh Token도 갱신할 때마다 새로 발급하고, 이전 토큰을 무효화한다. 이를 **Refresh Token Rotation** 이라 한다.

```
[기본 전략]
Access Token 만료 → Refresh Token으로 갱신 → 같은 Refresh Token 재사용

[RTR 전략]
Access Token 만료 → Refresh Token으로 갱신 → 새 Refresh Token 발급 + 이전 무효화
```

RTR을 구현하려면 Refresh Token을 DB나 Redis에 저장하고 관리해야 한다. 서버 부하는 증가하지만, 탈취된 Refresh Token의 피해를 최소화할 수 있다.

---

## 흔한 함정과 주의사항

### 1. 토큰 저장 위치: localStorage vs HttpOnly Cookie

| 방식 | XSS 취약 | CSRF 취약 | 구현 난이도 |
|------|----------|----------|-------------|
| **localStorage** | O (JS로 접근 가능) | X | 쉬움 |
| **HttpOnly Cookie** | X (JS 접근 불가) | O | 보통 |

**권장**: HttpOnly + Secure + SameSite=Strict 쿠키에 저장한다. XSS는 토큰 탈취로 이어지지만, CSRF는 SameSite 속성으로 효과적으로 방어된다.

```java
// 쿠키로 토큰을 내려보내는 예시
ResponseCookie cookie = ResponseCookie.from("access_token", accessToken)
        .httpOnly(true)
        .secure(true)
        .sameSite("Strict")
        .path("/")
        .maxAge(Duration.ofMinutes(30))
        .build();

response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
```

### 2. JWT + CSRF

JWT를 Authorization 헤더로 보내면 CSRF 보호가 불필요하다 — 브라우저가 자동으로 첨부하는 값이 아니기 때문이다. 하지만 JWT를 **쿠키**에 저장하면 CSRF 보호를 다시 활성화해야 한다.

```java
// 쿠키 기반 JWT라면 CSRF를 활성화해야 한다
.csrf(csrf -> csrf
    .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
    .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
```

### 3. 토큰 만료 처리

클라이언트는 `401 Unauthorized` 응답을 받으면 Refresh Token으로 갱신을 시도해야 한다. Axios interceptor 패턴이 일반적이다:

```javascript
// Axios interceptor 예시
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const { data } = await api.post('/api/auth/refresh', {
        refreshToken: getRefreshToken()
      });

      setAccessToken(data.accessToken);
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(originalRequest);
    }

    return Promise.reject(error);
  }
);
```

### 4. 토큰 무효화 (로그아웃)

JWT는 stateless이므로 서버에서 강제 만료시킬 수 없다. 로그아웃 구현 방법:

- **블랙리스트** — Redis에 로그아웃된 토큰을 저장, 매 요청마다 확인
- **짧은 만료** — Access Token을 5~15분으로 짧게 설정해서 피해 최소화
- **토큰 버전** — DB에 사용자별 토큰 버전을 두고, 로그아웃 시 버전을 올림

### 5. Secret Key 관리

```yaml
# 절대 이렇게 하지 마세요
jwt:
  secret: "mysecret"  # 너무 짧고, 코드에 하드코딩

# 환경변수나 외부 설정 관리 도구 사용
jwt:
  secret: ${JWT_SECRET}  # 환경변수에서 주입
```

프로덕션에서는 **AWS Secrets Manager**, **HashiCorp Vault**, 또는 **Spring Cloud Config** 같은 외부 설정 관리 도구를 사용해야 한다.

---

## 전체 프로젝트 구조

```
src/main/java/com/example/demo/
├── config/
│   └── SecurityConfig.java
├── controller/
│   └── AuthController.java
├── domain/
│   ├── User.java
│   └── Role.java
├── dto/
│   ├── LoginRequest.java
│   ├── SignupRequest.java
│   ├── RefreshRequest.java
│   └── TokenResponse.java
├── repository/
│   └── UserRepository.java
├── security/
│   ├── JwtTokenProvider.java
│   ├── JwtAuthenticationFilter.java
│   └── CustomUserDetailsService.java
└── DemoApplication.java
```

---

## 마무리

Spring Security + JWT 인증의 핵심은 **SecurityFilterChain에 커스텀 JWT 필터를 끼워 넣는 것**이다. 나머지는 토큰을 만들고, 검증하고, SecurityContext에 세팅하는 흐름을 따른다.

실무 체크리스트:

1. **Access Token은 짧게** (15~30분), **Refresh Token은 길게** (7~14일)
2. 토큰은 **HttpOnly Cookie**에 저장 — localStorage는 XSS에 취약
3. **비밀키는 환경변수**로 관리, 코드에 절대 하드코딩하지 않기
4. 금전적 피해가 큰 서비스라면 **RTR 전략** 도입 고려
5. 로그아웃은 **Redis 블랙리스트** + 짧은 Access Token 조합으로 구현

다음 글에서는 **Spring Security + OAuth 2.0 소셜 로그인** (Google, Kakao)을 다룰 예정이다.

---

References
----------

- [Spring Security Reference — Servlet Architecture](https://docs.spring.io/spring-security/reference/servlet/architecture.html)
- [RFC 7519 — JSON Web Token](https://datatracker.ietf.org/doc/html/rfc7519)
- [JJWT GitHub](https://github.com/jwtk/jjwt)
- [OWASP — JWT Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)

---

## 관련 포스트

- [Spring Boot + JPA 기초](/spring/2026/03/15/spring-boot-jpa-basics/)
- [Spring Security 아키텍처 완전 이해](/spring/2026/04/05/spring-security-architecture/)
- [Spring AOP 내부 동작 원리](/spring/2026/04/03/spring-aop-internals/)
