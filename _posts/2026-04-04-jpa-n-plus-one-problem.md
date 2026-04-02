---
title: "JPA N+1 문제 완전 정복"
subtitle: "발생 원인부터 Fetch Join, @EntityGraph, Batch Size, QueryDSL까지 해결 전략 총정리"
layout: post
date: "2026-04-04"
author: "DooDoo"
header-style: text
header-bg-css: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)"
catalog: true
keywords: "jpa, spring, hibernate, performance, backend"
description: "JPA N+1 문제의 발생 원인을 이해하고, Fetch Join, @EntityGraph, Batch Size, QueryDSL 등 다양한 해결 전략을 실무 관점에서 정리합니다."
series: "백엔드 심화"
tags:
  - JPA
  - Spring
  - Hibernate
  - Performance
  - Backend
categories:
  - spring
---

## 들어가며

JPA를 실무에서 사용하다 보면 반드시 만나게 되는 문제가 있다. 바로 **N+1 문제**다. 엔티티 하나를 조회했을 뿐인데 연관된 엔티티를 가져오기 위해 추가 쿼리가 N번 더 나가는 현상이다.

개발 단계에서는 데이터가 적어 문제를 인지하지 못하다가, 운영 환경에서 데이터가 쌓이면 성능이 급격히 떨어진다. 이 글에서는 N+1 문제의 원인을 정확히 이해하고, 상황에 맞는 해결 전략을 코드와 함께 정리한다.

---

## N+1 문제란 무엇인가

### 개념

N+1 문제란 **1번의 쿼리로 N개의 엔티티를 조회한 뒤, 각 엔티티의 연관 관계를 조회하기 위해 N번의 추가 쿼리가 발생**하는 현상이다.

예를 들어 `Team`과 `Member`가 1:N 관계일 때:

```java
@Entity
public class Team {
    @Id @GeneratedValue
    private Long id;
    private String name;

    @OneToMany(mappedBy = "team")
    private List<Member> members = new ArrayList<>();
}

@Entity
public class Member {
    @Id @GeneratedValue
    private Long id;
    private String username;

    @ManyToOne
    @JoinColumn(name = "team_id")
    private Team team;
}
```

팀 목록을 조회하고 각 팀의 멤버를 출력하면:

```java
List<Team> teams = teamRepository.findAll(); // 쿼리 1번

for (Team team : teams) {
    System.out.println(team.getMembers().size()); // 팀마다 쿼리 1번씩
}
```

팀이 10개면 **1(팀 전체 조회) + 10(각 팀의 멤버 조회) = 11번**의 쿼리가 실행된다. 팀이 1000개면 1001번이다.

### 발생 원인

N+1 문제는 **JPA가 연관 엔티티를 프록시 객체로 감싸고, 실제 접근 시점에 쿼리를 실행하는 지연 로딩(Lazy Loading) 메커니즘** 때문에 발생한다.

JPQL이나 Spring Data JPA의 `findAll()`은 엔티티 자체만 조회하는 SQL을 생성한다. 연관 관계는 별도로 조회하지 않으며, 이후 해당 필드에 접근할 때 개별 쿼리가 나간다.

---

## 지연 로딩 vs 즉시 로딩

### 즉시 로딩 (EAGER)

```java
@OneToMany(mappedBy = "team", fetch = FetchType.EAGER)
private List<Member> members;
```

엔티티 조회 시 연관 엔티티도 **즉시** 함께 가져온다. 하지만 이것이 N+1을 해결하지는 않는다.

**JPQL을 사용하면 즉시 로딩이어도 N+1이 발생한다.** JPQL은 SQL로 번역될 때 연관 관계를 고려하지 않고, 조회 후 즉시 로딩 설정을 보고 추가 쿼리를 실행하기 때문이다.

```java
// EAGER로 설정해도 JPQL 사용 시 N+1 발생
@Query("SELECT t FROM Team t")
List<Team> findAllTeams();
```

### 지연 로딩 (LAZY)

```java
@OneToMany(mappedBy = "team", fetch = FetchType.LAZY)
private List<Member> members;
```

연관 엔티티에 **실제로 접근할 때** 쿼리가 나간다. 접근하지 않으면 쿼리가 나가지 않는다는 장점이 있다.

### 결론: 기본 전략은 LAZY

**모든 연관 관계는 `FetchType.LAZY`로 설정하는 것이 원칙이다.** `@ManyToOne`, `@OneToOne`은 기본값이 `EAGER`이므로 명시적으로 `LAZY`를 지정해야 한다.

```java
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "team_id")
private Team team;
```

지연 로딩으로 설정한 뒤, 필요한 시점에 적절한 방법으로 연관 엔티티를 함께 가져오는 것이 N+1 문제 해결의 핵심이다.

---

## 해결 전략 1: Fetch Join

가장 많이 사용하는 해결 방법이다. JPQL에서 `JOIN FETCH`를 사용하면 연관 엔티티를 **한 번의 쿼리로** 함께 조회한다.

### 기본 사용법

```java
public interface TeamRepository extends JpaRepository<Team, Long> {

    @Query("SELECT t FROM Team t JOIN FETCH t.members")
    List<Team> findAllWithMembers();
}
```

실행되는 SQL:

```sql
SELECT t.*, m.*
FROM team t
INNER JOIN member m ON t.id = m.team_id
```

쿼리 **1번**으로 팀과 멤버를 모두 가져온다.

### 중복 제거: DISTINCT

일대다 Fetch Join은 카테시안 곱 때문에 **결과가 중복**될 수 있다. 팀 1개에 멤버 3명이면 팀이 3번 반복된다.

```java
@Query("SELECT DISTINCT t FROM Team t JOIN FETCH t.members")
List<Team> findAllWithMembers();
```

Hibernate 6(Spring Boot 3.x)부터는 일대다 Fetch Join 시 자동으로 중복을 제거해주지만, 명시적으로 `DISTINCT`를 쓰는 것이 안전하다.

### 주의사항: 페이징 불가

**일대다(1:N) Fetch Join에서는 페이징을 사용할 수 없다.**

```java
// 위험! 메모리에서 페이징 처리됨
@Query("SELECT t FROM Team t JOIN FETCH t.members")
Page<Team> findAllWithMembers(Pageable pageable);
```

Hibernate는 경고 로그를 남기면서 전체 데이터를 메모리에 올린 뒤 애플리케이션 레벨에서 페이징한다. 데이터가 많으면 **OutOfMemoryError**가 발생한다.

> `HHH90003004: firstResult/maxResults specified with collection fetch; applying in memory`

**다대일(N:1) Fetch Join은 페이징에 문제가 없다.** 결과 row 수가 변하지 않기 때문이다.

```java
// 안전! 다대일 Fetch Join + 페이징
@Query("SELECT m FROM Member m JOIN FETCH m.team")
Page<Member> findAllWithTeam(Pageable pageable);
```

### 주의사항: 둘 이상의 컬렉션 Fetch Join 불가

```java
// MultipleBagFetchException 발생!
@Query("SELECT t FROM Team t JOIN FETCH t.members JOIN FETCH t.projects")
List<Team> findAllWithMembersAndProjects();
```

둘 이상의 `@OneToMany` 컬렉션을 동시에 Fetch Join하면 카테시안 곱이 기하급수적으로 증가한다. Hibernate는 이를 `MultipleBagFetchException`으로 차단한다.

---

## 해결 전략 2: @EntityGraph

`@EntityGraph`는 JPQL 없이도 Fetch Join과 동일한 효과를 낼 수 있다.

### 기본 사용법

```java
public interface TeamRepository extends JpaRepository<Team, Long> {

    @EntityGraph(attributePaths = {"members"})
    @Query("SELECT t FROM Team t")
    List<Team> findAllWithMembers();
}
```

### Spring Data JPA 메서드 이름 쿼리와 함께 사용

```java
@EntityGraph(attributePaths = {"members"})
List<Team> findByName(String name);
```

JPQL을 직접 작성하지 않아도 되므로 간단한 경우에 유용하다.

### 중첩 연관 관계 로딩

```java
@EntityGraph(attributePaths = {"members", "members.address"})
List<Team> findAllWithMembersAndAddress();
```

점(`.`)으로 중첩 경로를 지정할 수 있다.

### Named EntityGraph

엔티티 클래스에 미리 정의하고 재사용할 수 있다:

```java
@Entity
@NamedEntityGraph(
    name = "Team.withMembers",
    attributeNodes = @NamedAttributeNode("members")
)
public class Team {
    // ...
}
```

```java
@EntityGraph(value = "Team.withMembers")
List<Team> findAll();
```

### Fetch Join vs @EntityGraph

| 항목 | Fetch Join | @EntityGraph |
|------|-----------|-------------|
| 사용법 | JPQL에 `JOIN FETCH` 작성 | 어노테이션으로 지정 |
| JOIN 방식 | INNER JOIN | LEFT OUTER JOIN |
| 유연성 | WHERE 조건 등 자유롭게 조합 | 단순 연관 로딩에 적합 |
| 가독성 | JPQL이 길어질 수 있음 | 깔끔하고 선언적 |

**`@EntityGraph`는 LEFT OUTER JOIN**을 사용하므로, 연관 엔티티가 없는 경우에도 부모 엔티티가 조회된다. Fetch Join의 INNER JOIN과 동작이 다르니 주의하자.

---

## 해결 전략 3: Batch Size

**페이징이 필요한 일대다 관계**에서 가장 실용적인 해결책이다.

### 동작 원리

`@BatchSize`를 설정하면 지연 로딩 시 개별 쿼리 대신 **IN 절로 묶어서** 한 번에 조회한다.

```java
@Entity
public class Team {
    @OneToMany(mappedBy = "team")
    @BatchSize(size = 100)
    private List<Member> members;
}
```

팀 10개를 조회하고 각 팀의 멤버에 접근하면:

```sql
-- Batch Size 없이: 쿼리 10번
SELECT * FROM member WHERE team_id = 1;
SELECT * FROM member WHERE team_id = 2;
...
SELECT * FROM member WHERE team_id = 10;

-- Batch Size = 100: 쿼리 1번
SELECT * FROM member WHERE team_id IN (1, 2, 3, ..., 10);
```

### 글로벌 설정

개별 엔티티마다 `@BatchSize`를 붙이는 대신, `application.yml`에서 글로벌로 설정할 수 있다:

```yaml
spring:
  jpa:
    properties:
      hibernate:
        default_batch_fetch_size: 100
```

**실무에서는 글로벌 설정을 100~1000 사이로 잡는 것을 권장한다.** 김영한님의 JPA 강의에서도 이 방식을 강조한다.

### Batch Size + 페이징 조합

Fetch Join으로 페이징이 불가능한 일대다 관계에서의 해결 패턴:

```java
// 1. 부모 엔티티만 페이징 조회
@Query("SELECT t FROM Team t")
Page<Team> findAllPaged(Pageable pageable);

// 2. Batch Size 설정으로 자식 엔티티를 IN절로 조회
// application.yml에 default_batch_fetch_size: 100 설정
```

```java
Page<Team> teams = teamRepository.findAllPaged(PageRequest.of(0, 10));

for (Team team : teams) {
    // Batch Size 덕분에 IN절 쿼리 1번으로 10개 팀의 멤버를 모두 조회
    System.out.println(team.getMembers().size());
}
```

총 쿼리: **2번** (팀 페이징 1번 + 멤버 IN절 1번). N+1이 1+1로 최적화된다.

---

## 해결 전략 4: QueryDSL

복잡한 조건이 필요하거나 동적 쿼리가 필요한 경우 QueryDSL이 강력하다.

### 기본 Fetch Join

```java
@Repository
@RequiredArgsConstructor
public class TeamQueryRepository {

    private final JPAQueryFactory queryFactory;

    public List<Team> findAllWithMembers() {
        return queryFactory
            .selectFrom(team)
            .leftJoin(team.members, member).fetchJoin()
            .distinct()
            .fetch();
    }
}
```

### 동적 조건 + Fetch Join

```java
public List<Team> searchTeams(TeamSearchCondition condition) {
    return queryFactory
        .selectFrom(team)
        .leftJoin(team.members, member).fetchJoin()
        .where(
            teamNameContains(condition.getTeamName()),
            memberCountGoe(condition.getMinMemberCount())
        )
        .distinct()
        .fetch();
}

private BooleanExpression teamNameContains(String teamName) {
    return hasText(teamName) ? team.name.contains(teamName) : null;
}

private BooleanExpression memberCountGoe(Integer minCount) {
    return minCount != null ? team.members.size().goe(minCount) : null;
}
```

### DTO 직접 조회로 N+1 원천 차단

연관 엔티티의 특정 필드만 필요하다면, DTO로 직접 조회하여 N+1 자체를 없앨 수 있다:

```java
public List<TeamMemberDto> findTeamMemberDtos() {
    return queryFactory
        .select(Projections.constructor(TeamMemberDto.class,
            team.name,
            member.username,
            member.age
        ))
        .from(team)
        .leftJoin(team.members, member)
        .fetch();
}
```

이 경우 엔티티가 아닌 순수 DTO를 반환하므로 지연 로딩 자체가 발생하지 않는다.

---

## 실무 가이드: 언제 무엇을 쓸까

### 의사결정 흐름

```
연관 엔티티를 함께 조회해야 하는가?
├── NO → Lazy Loading 유지 (쿼리 추가 없음)
└── YES
    ├── 페이징이 필요한가?
    │   ├── 다대일(N:1) → Fetch Join + 페이징 ✅
    │   └── 일대다(1:N) → Batch Size + 페이징 ✅
    ├── 단순 연관 로딩인가?
    │   ├── YES → @EntityGraph (간결)
    │   └── NO → Fetch Join (유연)
    ├── 동적 조건이 필요한가?
    │   └── YES → QueryDSL + Fetch Join
    └── 특정 컬럼만 필요한가?
        └── YES → DTO 직접 조회 (QueryDSL Projection)
```

### 실무 권장 설정

```yaml
# application.yml
spring:
  jpa:
    properties:
      hibernate:
        default_batch_fetch_size: 100  # 글로벌 Batch Size
    open-in-view: false                # OSIV 끄기 (권장)

logging:
  level:
    org.hibernate.SQL: debug                              # SQL 로그
    org.hibernate.orm.jdbc.bind: trace                    # 바인딩 파라미터
```

### 정리

| 방법 | 장점 | 단점 | 사용 시점 |
|------|------|------|----------|
| Fetch Join | 쿼리 1번, 가장 직관적 | 페이징 제한, 컬렉션 2개 이상 불가 | 기본 해결책 |
| @EntityGraph | 선언적, JPQL 불필요 | LEFT JOIN 고정, 복잡한 조건 어려움 | 단순 연관 로딩 |
| Batch Size | 페이징 가능, 설정 간단 | 쿼리가 1+1번 (완전한 1번은 아님) | 페이징 + 일대다 |
| QueryDSL | 동적 쿼리, 타입 안전 | 설정 복잡, 러닝 커브 | 복잡한 조건, 동적 쿼리 |
| DTO 조회 | N+1 원천 차단, 성능 최적 | 엔티티가 아닌 DTO 반환 | 조회 전용 API |

---

## 마무리

N+1 문제는 JPA를 쓰는 한 피할 수 없다. 중요한 것은 **문제를 인지하고, 상황에 맞는 해결책을 선택하는 것**이다.

1. **기본 전략**: 모든 연관 관계를 `LAZY`로 설정하고, `default_batch_fetch_size`를 글로벌로 잡아둔다.
2. **필요한 곳에서**: Fetch Join 또는 @EntityGraph로 한 방 쿼리를 만든다.
3. **페이징이 필요하면**: Batch Size를 활용한다.
4. **복잡한 조건이면**: QueryDSL로 해결한다.

항상 `hibernate.SQL` 로그를 켜두고, 개발 단계에서 쿼리 수를 확인하는 습관을 들이자. 운영에서 터지기 전에 잡을 수 있다.
