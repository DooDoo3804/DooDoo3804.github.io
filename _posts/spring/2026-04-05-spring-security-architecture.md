---
title: "Spring Security 아키텍처 완전 이해"
subtitle: "필터 체인 구조부터 JWT 인증, Method Security, CSRF/CORS 설정까지"
layout: post
date: "2026-04-05"
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
catalog: true
keywords: "spring, security, authentication, authorization, jwt, backend"
description: "Spring Security의 필터 체인 구조, 인증/인가 메커니즘, JWT 기반 인증 구현, Method Security, CSRF/CORS 설정을 깊이 있게 정리합니다."
series: "백엔드 심화"
tags:
  - Spring
  - Security
  - Authentication
  - Authorization
  - JWT
  - Backend
categories:
  - spring
---

## 들어가며

Spring Security는 Spring 기반 애플리케이션의 인증(Authentication)과 인가(Authorization)를 담당하는 프레임워크다. 강력하지만 그만큼 내부 구조가 복잡하다.

설정을 복사해서 붙여넣기만 하면 "왜 이렇게 동작하는지" 이해하지 못한 채로 개발하게 된다. 이 글에서는 Spring Security 6.x(Spring Boot 3.x) 기준으로 **아키텍처를 밑바닥부터** 정리한다.

---

## Spring Security 필터 체인 구조

### 서블릿 필터 기반

Spring Security는 **서블릿 필터(Servlet Filter)** 기반으로 동작한다. 클라이언트의 HTTP 요청이 `DispatcherServlet`에 도달하기 전에 보안 필터 체인을 거친다.

```
Client → [Filter₁] → [Filter₂] → ... → [FilterN] → DispatcherServlet → Controller
```

### DelegatingFilterProxy와 FilterChainProxy

Spring Security는 서블릿 컨테이너와 Spring 컨테이너를 연결하기 위해 두 가지 핵심 컴포넌트를 사용한다:

```
서블릿 컨테이너
└── DelegatingFilterProxy (서블릿 필터)
    └── FilterChainProxy (Spring Bean)
        └── SecurityFilterChain
            ├── DisableEncodeUrlFilter
            ├── SecurityContextHolderFilter
            ├── CsrfFilter
            ├── LogoutFilter
            ├── UsernamePasswordAuthenticationFilter
            ├── BearerTokenAuthenticationFilter
            ├── AuthorizationFilter
            └── ...
```

- **DelegatingFilterProxy**: 서블릿 필터로 등록되지만, 실제 처리를 Spring Bean인 `FilterChainProxy`에 위임한다.
- **FilterChainProxy**: 여러 `SecurityFilterChain`을 관리하며, 요청 URL에 맞는 체인을 선택하여 실행한다.

### SecurityFilterChain 설정

Spring Security 6.x에서는 `SecurityFilterChain`을 Bean으로 등록하여 설정한다:

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            );

        return http.build();
    }
}
```

### 다중 SecurityFilterChain

URL 패턴에 따라 서로 다른 보안 설정을 적용할 수 있다:

```java
@Bean
@Order(1)
public SecurityFilterChain apiFilterChain(HttpSecurity http) throws Exception {
    http
        .securityMatcher("/api/**")
        .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
        .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
    return http.build();
}

@Bean
@Order(2)
public SecurityFilterChain webFilterChain(HttpSecurity http) throws Exception {
    http
        .securityMatcher("/**")
        .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
    return http.build();
}
```

`@Order`가 작을수록 먼저 매칭을 시도한다. `/api/users` 요청은 `apiFilterChain`에, `/home` 요청은 `webFilterChain`에 매칭된다.

---

## Authentication vs Authorization

Spring Security의 두 핵심 개념을 명확히 구분해야 한다.

### Authentication (인증)

**"너는 누구냐?"** — 사용자의 신원을 확인하는 과정.

- 로그인 (ID/PW 확인)
- JWT 토큰 검증
- OAuth2 소셜 로그인

### Authorization (인가)

**"너는 이걸 할 수 있느냐?"** — 인증된 사용자가 특정 리소스에 접근할 권한이 있는지 확인하는 과정.

- `ROLE_USER`는 `/api/users`에 접근 가능
- `ROLE_ADMIN`만 `/api/admin`에 접근 가능

### 처리 순서

```
요청 → [인증 필터] → SecurityContext에 Authentication 저장 → [인가 필터] → Controller
```

인증이 먼저 수행되고, 그 결과(Authentication 객체)를 바탕으로 인가가 수행된다.

---

## SecurityContextHolder와 SecurityContext

### 구조

```
SecurityContextHolder
└── SecurityContext
    └── Authentication
        ├── Principal (사용자 정보)
        ├── Credentials (비밀번호 등)
        └── Authorities (권한 목록)
```

### SecurityContextHolder

`SecurityContext`를 보관하는 저장소다. 기본적으로 **ThreadLocal**을 사용하여 스레드별로 `SecurityContext`를 관리한다.

```java
// 현재 인증된 사용자 정보 가져오기
SecurityContext context = SecurityContextHolder.getContext();
Authentication authentication = context.getAuthentication();

String username = authentication.getName();
Collection<? extends GrantedAuthority> authorities = authentication.getAuthorities();
```

### Authentication 인터페이스

```java
public interface Authentication extends Principal, Serializable {
    // 권한 목록 (ROLE_USER, ROLE_ADMIN 등)
    Collection<? extends GrantedAuthority> getAuthorities();

    // 비밀번호 (인증 후 보안을 위해 null로 지워짐)
    Object getCredentials();

    // 사용자 상세 정보
    Object getDetails();

    // UserDetails 또는 사용자 식별자
    Object getPrincipal();

    // 인증 완료 여부
    boolean isAuthenticated();
}
```

### 컨트롤러에서 인증 정보 접근

```java
@RestController
@RequestMapping("/api")
public class UserController {

    // 방법 1: @AuthenticationPrincipal
    @GetMapping("/me")
    public UserResponse getMyInfo(@AuthenticationPrincipal UserDetails userDetails) {
        return userService.findByUsername(userDetails.getUsername());
    }

    // 방법 2: SecurityContextHolder 직접 접근
    @GetMapping("/me2")
    public UserResponse getMyInfo2() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String username = auth.getName();
        return userService.findByUsername(username);
    }
}
```

---

## UserDetailsService와 UserDetails 구현

### UserDetails 인터페이스

Spring Security가 이해하는 사용자 정보 형태다:

```java
public interface UserDetails extends Serializable {
    Collection<? extends GrantedAuthority> getAuthorities();
    String getPassword();
    String getUsername();
    boolean isAccountNonExpired();
    boolean isAccountNonLocked();
    boolean isCredentialsNonExpired();
    boolean isEnabled();
}
```

### 커스텀 UserDetails 구현

```java
@Getter
@RequiredArgsConstructor
public class CustomUserDetails implements UserDetails {

    private final User user;  // 우리 도메인의 User 엔티티

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()));
    }

    @Override
    public String getPassword() {
        return user.getPassword();
    }

    @Override
    public String getUsername() {
        return user.getEmail();
    }

    @Override
    public boolean isAccountNonExpired() { return true; }

    @Override
    public boolean isAccountNonLocked() { return true; }

    @Override
    public boolean isCredentialsNonExpired() { return true; }

    @Override
    public boolean isEnabled() { return user.isActive(); }
}
```

### UserDetailsService 구현

DB에서 사용자 정보를 조회하여 `UserDetails`로 변환하는 역할:

```java
@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() ->
                new UsernameNotFoundException("사용자를 찾을 수 없습니다: " + email));

        return new CustomUserDetails(user);
    }
}
```

### AuthenticationProvider와의 관계

```
AuthenticationFilter
  → AuthenticationManager
    → AuthenticationProvider
      → UserDetailsService.loadUserByUsername()
      → PasswordEncoder.matches()
    → Authentication 객체 반환
  → SecurityContextHolder에 저장
```

`AuthenticationProvider`는 `UserDetailsService`로 사용자를 조회하고, `PasswordEncoder`로 비밀번호를 검증한 뒤 `Authentication` 객체를 만들어 반환한다.

---

## JWT 기반 인증 구현

실제 JWT 인증의 전체 구현 코드와 Refresh Token 전략은 [Spring Security 6 + JWT 인증 구현](/spring/2026/04/01/spring-security-jwt/)에서 다룬다.

### JWT 유틸리티 클래스

```java
@Component
public class JwtTokenProvider {

    @Value("${jwt.secret}")
    private String secretKey;

    @Value("${jwt.access-token-validity}")
    private long accessTokenValidity;  // 예: 30분

    @Value("${jwt.refresh-token-validity}")
    private long refreshTokenValidity;  // 예: 7일

    private SecretKey getSigningKey() {
        byte[] keyBytes = Decoders.BASE64.decode(secretKey);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    public String generateAccessToken(Authentication authentication) {
        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();
        Date now = new Date();
        Date expiry = new Date(now.getTime() + accessTokenValidity);

        return Jwts.builder()
            .subject(userDetails.getUsername())
            .claim("role", userDetails.getUser().getRole().name())
            .issuedAt(now)
            .expiration(expiry)
            .signWith(getSigningKey())
            .compact();
    }

    public String getUsernameFromToken(String token) {
        return Jwts.parser()
            .verifyWith(getSigningKey())
            .build()
            .parseSignedClaims(token)
            .getPayload()
            .getSubject();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
```

### JwtAuthenticationFilter

모든 요청에서 JWT를 검증하고 `SecurityContext`에 인증 정보를 저장하는 필터:

```java
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;
    private final CustomUserDetailsService userDetailsService;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        // 1. 헤더에서 JWT 추출
        String token = resolveToken(request);

        // 2. 토큰 검증
        if (token != null && jwtTokenProvider.validateToken(token)) {
            // 3. 토큰에서 사용자 정보 추출
            String username = jwtTokenProvider.getUsernameFromToken(token);

            // 4. UserDetailsService로 사용자 조회
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);

            // 5. Authentication 객체 생성 및 SecurityContext에 저장
            UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(
                    userDetails, null, userDetails.getAuthorities());

            authentication.setDetails(
                new WebAuthenticationDetailsSource().buildDetails(request));

            SecurityContextHolder.getContext().setAuthentication(authentication);
        }

        filterChain.doFilter(request, response);
    }

    private String resolveToken(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (bearerToken != null && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }
}
```

### SecurityConfig에 필터 등록

```java
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthFilter,
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

### 로그인 / 토큰 발급 API

```java
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider jwtTokenProvider;

    @PostMapping("/login")
    public TokenResponse login(@RequestBody @Valid LoginRequest request) {
        // AuthenticationManager가 UserDetailsService + PasswordEncoder로 검증
        Authentication authentication = authenticationManager.authenticate(
            new UsernamePasswordAuthenticationToken(
                request.getEmail(), request.getPassword()));

        // 인증 성공 시 토큰 발급
        String accessToken = jwtTokenProvider.generateAccessToken(authentication);

        return new TokenResponse(accessToken);
    }
}
```

### 전체 인증 흐름 정리

```
1. POST /api/auth/login (email, password)
2. AuthenticationManager → UserDetailsService → DB 조회
3. PasswordEncoder.matches()로 비밀번호 검증
4. 검증 성공 → JWT 토큰 발급 → 클라이언트에 반환

5. GET /api/users (Authorization: Bearer xxx)
6. JwtAuthenticationFilter → 토큰 파싱 → 유효성 검증
7. UserDetailsService → DB에서 사용자 조회
8. SecurityContext에 Authentication 저장
9. AuthorizationFilter → 권한 확인
10. Controller 도달
```

---

## Method Security

URL 패턴 기반 인가 외에, **메서드 레벨**에서도 권한을 제어할 수 있다.

### 활성화

```java
@Configuration
@EnableMethodSecurity  // Spring Security 6.x
public class MethodSecurityConfig {
}
```

### @PreAuthorize

메서드 실행 **전**에 권한을 검사한다. SpEL(Spring Expression Language)을 사용하여 유연한 조건을 표현할 수 있다:

```java
@Service
@RequiredArgsConstructor
public class PostService {

    // ADMIN 역할만 삭제 가능
    @PreAuthorize("hasRole('ADMIN')")
    public void deletePost(Long postId) {
        postRepository.deleteById(postId);
    }

    // 본인 게시글만 수정 가능
    @PreAuthorize("#userId == authentication.principal.user.id")
    public PostResponse updatePost(Long userId, Long postId, PostUpdateRequest request) {
        // ...
    }

    // ADMIN이거나 본인인 경우
    @PreAuthorize("hasRole('ADMIN') or #userId == authentication.principal.user.id")
    public UserResponse getUserProfile(Long userId) {
        // ...
    }
}
```

### @PostAuthorize

메서드 실행 **후**에 반환값을 기반으로 권한을 검사한다:

```java
// 반환된 게시글의 작성자만 볼 수 있음
@PostAuthorize("returnObject.authorId == authentication.principal.user.id")
public PostDetailResponse getSecretPost(Long postId) {
    return postRepository.findById(postId)
        .map(PostDetailResponse::from)
        .orElseThrow();
}
```

### @Secured

간단한 역할 기반 인가에 사용한다. SpEL은 지원하지 않는다:

```java
@Secured("ROLE_ADMIN")
public void adminOnly() {
    // ...
}

@Secured({"ROLE_ADMIN", "ROLE_MANAGER"})
public void adminOrManager() {
    // ...
}
```

### @PreAuthorize vs @Secured 비교

| 항목 | @PreAuthorize | @Secured |
|------|-------------|---------|
| SpEL 지원 | O | X |
| 복잡한 조건 | `hasRole() and #id == ...` | 역할 이름만 가능 |
| 파라미터 접근 | `#paramName`으로 접근 가능 | 불가 |
| 권장 여부 | **권장** | 단순한 경우만 |

---

## CSRF 설정

### CSRF란

**Cross-Site Request Forgery** — 사용자가 의도하지 않은 요청을 보내도록 유도하는 공격이다. 세션 쿠키 기반 인증에서 위험하다.

### REST API에서의 CSRF

JWT 기반의 stateless API는 쿠키를 사용하지 않으므로 CSRF 공격에 취약하지 않다. 따라서 **비활성화**하는 것이 일반적이다:

```java
http.csrf(csrf -> csrf.disable());
```

### CSRF를 활성화해야 하는 경우

서버 렌더링(Thymeleaf 등) + 세션 기반 인증을 사용하는 경우 CSRF 보호를 유지해야 한다:

```java
http.csrf(csrf -> csrf
    .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
    .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
);
```

```html
<!-- Thymeleaf 폼에서 자동으로 CSRF 토큰 포함 -->
<form th:action="@{/api/posts}" method="post">
    <input type="text" name="title" />
    <button type="submit">작성</button>
</form>
```

---

## CORS 설정

### CORS란

**Cross-Origin Resource Sharing** — 브라우저가 다른 출처(Origin)의 리소스에 접근할 수 있도록 허용하는 메커니즘이다.

프론트엔드(`localhost:3000`)와 백엔드(`localhost:8080`)가 다른 포트에서 실행되면 CORS 에러가 발생한다.

### Spring Security에서 CORS 설정

```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
        .cors(cors -> cors.configurationSource(corsConfigurationSource()))
        // ... 나머지 설정
    ;
    return http.build();
}

@Bean
public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration config = new CorsConfiguration();

    config.setAllowedOrigins(List.of(
        "http://localhost:3000",
        "https://myapp.com"
    ));
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH"));
    config.setAllowedHeaders(List.of("*"));
    config.setExposedHeaders(List.of("Authorization"));
    config.setAllowCredentials(true);
    config.setMaxAge(3600L);

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
}
```

### 주요 설정 항목

| 항목 | 설명 |
|------|------|
| `allowedOrigins` | 허용할 출처 목록 (`*` 사용 시 credentials 불가) |
| `allowedMethods` | 허용할 HTTP 메서드 |
| `allowedHeaders` | 허용할 요청 헤더 |
| `exposedHeaders` | 클라이언트에서 읽을 수 있는 응답 헤더 |
| `allowCredentials` | 쿠키/인증 헤더 포함 여부 |
| `maxAge` | Preflight 요청 캐싱 시간(초) |

---

## 마무리

Spring Security의 핵심 아키텍처를 정리하면:

1. **필터 체인**: 요청이 Controller에 도달하기 전에 보안 필터를 순서대로 통과한다.
2. **인증(Authentication)**: 사용자가 누구인지 확인하고 `SecurityContext`에 저장한다.
3. **인가(Authorization)**: `SecurityContext`의 권한 정보를 바탕으로 접근을 허용/거부한다.
4. **JWT 인증**: 커스텀 필터에서 토큰을 검증하고 `SecurityContext`에 수동으로 인증 정보를 설정한다.
5. **Method Security**: URL 패턴뿐 아니라 메서드 레벨에서도 세밀한 권한 제어가 가능하다.

이 구조를 이해하면 Spring Security의 어떤 기능을 쓰더라도 "왜 이렇게 동작하는지" 설명할 수 있다. 복사-붙여넣기 설정에서 벗어나 **자신만의 보안 설계**를 할 수 있게 된다.

---

## 관련 포스트

- [Spring Security 6 + JWT 인증 구현](/spring/2026/04/01/spring-security-jwt/)
- [Spring AOP 내부 동작 원리](/spring/2026/04/03/spring-aop-internals/)
- [Spring Bean 라이프사이클 완전 정복](/spring/2026/04/05/spring-bean-lifecycle/)
