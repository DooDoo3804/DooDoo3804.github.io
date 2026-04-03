---
title: "Spring Boot + JPA로 REST API 만들기"
subtitle: "Entity, Repository, Service, Controller 패턴으로 CRUD API 구축하기"
layout: post
author: "DoYoon Kim"
header-style: text
catalog: true
series: "Spring Boot"
tags:
  - Spring
  - Backend
  - Java
categories: [spring]
description: "Spring Boot와 JPA로 REST API를 만드는 방법. Entity, Repository, Service, Controller 4계층 패턴으로 CRUD API를 단계별로 구현합니다."
---

## 들어가며

Spring Boot와 JPA를 사용하면 놀라울 정도로 적은 코드로 REST API를 만들 수 있다. 이번 글에서는 가장 기본적인 **Entity → Repository → Service → Controller** 계층 구조를 살펴보고, 간단한 게시글(Post) CRUD API를 구현해 본다.

---

## 프로젝트 세팅

`start.spring.io`에서 다음 의존성을 추가한다.

- **Spring Web** — REST Controller
- **Spring Data JPA** — ORM
- **H2 Database** — 개발용 인메모리 DB
- **Lombok** — 보일러플레이트 제거

`application.yml` 설정:

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:testdb
    driver-class-name: org.h2.Driver
  jpa:
    hibernate:
      ddl-auto: create-drop
    show-sql: true
    properties:
      hibernate:
        format_sql: true
  h2:
    console:
      enabled: true
```

---

## 1. Entity

Entity는 데이터베이스 테이블과 1:1로 매핑되는 클래스다. `@Entity` 어노테이션을 붙이면 JPA가 이 클래스를 기반으로 테이블을 자동 생성한다.

```java
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Post {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String content;

    private LocalDateTime createdAt;

    @Builder
    public Post(String title, String content) {
        this.title = title;
        this.content = content;
        this.createdAt = LocalDateTime.now();
    }

    public void update(String title, String content) {
        this.title = title;
        this.content = content;
    }
}
```

포인트 정리:
- `@Id` + `@GeneratedValue` — 기본키 자동 생성
- `@NoArgsConstructor(access = PROTECTED)` — JPA 스펙 요구사항 (기본 생성자 필요) + 외부 직접 생성 방지
- `update()` 메서드로 **Dirty Checking** 활용 (트랜잭션 내에서 필드 값 변경 시 자동 UPDATE 쿼리)

---

## 2. Repository

Spring Data JPA의 `JpaRepository`를 상속하면 기본 CRUD 메서드가 자동으로 제공된다.

```java
public interface PostRepository extends JpaRepository<Post, Long> {

    List<Post> findByTitleContaining(String keyword);
}
```

`findByTitleContaining` 같은 **메서드 이름 기반 쿼리**를 사용하면 별도의 SQL 작성 없이도 검색 기능을 구현할 수 있다. 내부적으로 `LIKE '%keyword%'` 쿼리가 생성된다.

---

## 3. Service

비즈니스 로직을 담당하는 계층이다. Controller에서 직접 Repository를 호출하지 않고 Service를 거치는 이유는 **관심사 분리**와 **트랜잭션 관리** 때문이다.

```java
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PostService {

    private final PostRepository postRepository;

    // 게시글 전체 조회
    public List<Post> findAll() {
        return postRepository.findAll();
    }

    // 게시글 단건 조회
    public Post findById(Long id) {
        return postRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("해당 게시글이 없습니다. id=" + id));
    }

    // 게시글 생성
    @Transactional
    public Long save(String title, String content) {
        Post post = Post.builder()
                .title(title)
                .content(content)
                .build();
        return postRepository.save(post).getId();
    }

    // 게시글 수정
    @Transactional
    public void update(Long id, String title, String content) {
        Post post = findById(id);
        post.update(title, content); // Dirty Checking
    }

    // 게시글 삭제
    @Transactional
    public void delete(Long id) {
        Post post = findById(id);
        postRepository.delete(post);
    }
}
```

`@Transactional(readOnly = true)`를 클래스 레벨에 걸고, 쓰기 작업에만 `@Transactional`을 따로 붙이는 패턴이 일반적이다. 읽기 전용 트랜잭션은 Hibernate의 플러시 모드를 MANUAL로 설정하기 때문에 성능상 이점이 있다.

---

## 4. Controller

클라이언트의 HTTP 요청을 받아서 Service에 위임하고, 결과를 JSON으로 반환한다.

```java
@RestController
@RequestMapping("/api/posts")
@RequiredArgsConstructor
public class PostController {

    private final PostService postService;

    @GetMapping
    public List<Post> findAll() {
        return postService.findAll();
    }

    @GetMapping("/{id}")
    public Post findById(@PathVariable Long id) {
        return postService.findById(id);
    }

    @PostMapping
    public ResponseEntity<Long> save(@RequestBody PostSaveRequest request) {
        Long id = postService.save(request.getTitle(), request.getContent());
        return ResponseEntity.status(HttpStatus.CREATED).body(id);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Void> update(@PathVariable Long id,
                                        @RequestBody PostUpdateRequest request) {
        postService.update(id, request.getTitle(), request.getContent());
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        postService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

---

## 전체 흐름 정리

```
Client → Controller → Service → Repository → Database
                         ↕
                      Entity (JPA 영속성 컨텍스트)
```

1. **Controller**: HTTP 요청/응답 처리
2. **Service**: 비즈니스 로직 + 트랜잭션 경계
3. **Repository**: 데이터 접근 추상화
4. **Entity**: 데이터베이스 테이블 매핑

이 4계층 구조를 지키면 각 레이어의 역할이 명확해지고, 테스트 작성과 유지보수가 훨씬 수월해진다.

---

## 마무리

이번 글에서는 Spring Boot + JPA의 가장 기본적인 패턴을 다뤘다. 실무에서는 여기에 **DTO 변환**, **예외 처리(@ControllerAdvice)**, **Validation**, **페이징 처리** 등이 추가된다. 또한 연관 관계가 복잡해지면 [JPA N+1 문제](/spring/2026/04/04/jpa-n-plus-one-problem/)를 반드시 이해해야 한다. 다음 글에서는 이 API에 Spring Security를 적용하는 방법을 알아보겠다.

---

## 관련 포스트

- [Spring Security 6 + JWT 인증 구현](/spring/2026/04/01/spring-security-jwt/)
