---
title: "Docker 입문: 컨테이너로 개발 환경 통일하기"
subtitle: "Dockerfile 작성부터 docker-compose까지 한 번에 정리"
layout: post
date: "2026-03-20"
author: "DoYoon Kim"
header-style: text
catalog: true
keywords: "docker, container, dockerfile, docker-compose, devops"
series: "Container & Infra"
tags:
  - Docker
  - DevOps
  - Backend
categories:
  - infra
description: "Docker 입문 가이드. Dockerfile 작성, Multi-stage Build, Docker Compose로 Spring Boot + PostgreSQL 개발 환경을 구성하는 방법을 정리합니다."
---

## Docker를 왜 쓰는가

"제 컴퓨터에서는 되는데요?" — 개발자라면 한 번쯤 들어본 말이다.

팀원마다 OS, JDK 버전, 로컬 DB 설정이 다르면 동일한 코드가 다른 결과를 낳는다. Docker는 **애플리케이션과 그 실행 환경을 하나의 패키지(컨테이너)로 묶어서** 어디서든 동일하게 동작하도록 보장한다.

---

## 핵심 개념

### Image vs Container

| 구분 | Image | Container |
|------|-------|-----------|
| 비유 | 클래스 | 인스턴스 |
| 상태 | 불변(Immutable) | 실행 중 변경 가능 |
| 저장 | Docker Registry (Docker Hub 등) | 로컬 머신 |

Image는 **읽기 전용 템플릿**이고, Container는 Image를 기반으로 생성된 **실행 중인 프로세스**다.

### Layer 구조

Docker Image는 여러 개의 **레이어**로 구성된다. Dockerfile의 각 명령어(RUN, COPY 등)가 하나의 레이어를 생성하며, 변경되지 않은 레이어는 **캐시**를 활용해 빌드 속도를 높인다.

---

## Dockerfile 작성

Spring Boot 애플리케이션을 컨테이너화하는 Dockerfile 예제:

```dockerfile
# 빌드 스테이지
FROM eclipse-temurin:17-jdk-alpine AS builder
WORKDIR /app
COPY gradle/ gradle/
COPY gradlew build.gradle settings.gradle ./
RUN ./gradlew dependencies --no-daemon
COPY src/ src/
RUN ./gradlew bootJar --no-daemon

# 실행 스테이지
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=builder /app/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

여기서 사용한 **Multi-stage Build**의 장점:
- 빌드에 필요한 JDK + Gradle은 최종 이미지에 포함되지 않는다
- 최종 이미지에는 JRE + JAR만 들어가므로 이미지 크기가 훨씬 작다
- 빌드 도구가 없으므로 보안 공격 표면(Attack Surface)도 줄어든다

---

## 자주 쓰는 Docker 명령어

```bash
# 이미지 빌드
docker build -t my-app:1.0 .

# 컨테이너 실행
docker run -d -p 8080:8080 --name my-app my-app:1.0

# 실행 중인 컨테이너 확인
docker ps

# 로그 확인
docker logs -f my-app

# 컨테이너 내부 접속
docker exec -it my-app /bin/sh

# 컨테이너 정지 및 삭제
docker stop my-app && docker rm my-app
```

---

## Docker Compose

실제 프로젝트에서는 애플리케이션 서버 하나만 띄우는 경우가 거의 없다. DB, Redis, 메시지 큐 등 여러 서비스를 함께 관리해야 한다. **Docker Compose**는 여러 컨테이너를 하나의 YAML 파일로 정의하고 한 번에 실행할 수 있게 해준다.

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/myapp
      SPRING_DATASOURCE_USERNAME: postgres
      SPRING_DATASOURCE_PASSWORD: secret
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secret
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
```

주요 포인트:
- `depends_on` + `healthcheck` — DB가 완전히 준비된 후 앱이 시작된다
- `volumes` — 컨테이너가 삭제되어도 데이터가 유지된다
- 서비스 이름(`db`)이 곧 내부 DNS 호스트명이 된다 (`jdbc:postgresql://db:5432/myapp`)

실행은 단 한 줄:

```bash
docker compose up -d
```

---

## .dockerignore

빌드 컨텍스트에서 불필요한 파일을 제외하면 빌드 속도가 빨라지고 이미지 크기도 줄어든다.

```
.git
.gradle
build
*.md
.env
```

---

## 정리

| 개념 | 핵심 |
|------|------|
| Image | 불변 실행 환경 템플릿 |
| Container | Image 기반 실행 인스턴스 |
| Dockerfile | Image 빌드 레시피 |
| Docker Compose | 다중 컨테이너 오케스트레이션 |
| Volume | 데이터 영속성 보장 |

Docker를 익히면 로컬 개발 환경 구축이 편해질 뿐 아니라, CI/CD 파이프라인과 Kubernetes로 나아가는 기반이 된다. 다음에는 GitHub Actions와 Docker를 연동한 CI/CD 파이프라인 구축을 다뤄볼 예정이다.

---

## 관련 포스트

- [Kubernetes 핵심 개념 — Pod부터 Deployment까지](/infra/2026/04/01/kubernetes-basics/)
