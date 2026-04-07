---
layout: post
title: "Kubernetes 핵심 개념 — Pod부터 Deployment까지"
subtitle: "Docker만으로는 부족할 때 — 쿠버네티스로 컨테이너 오케스트레이션 시작하기"
date: "2026-04-01"
author: "DoYoon Kim"
header-style: text
header-bg-css: "linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1f2a38 100%)"
catalog: true
keywords: "kubernetes, pod, deployment, service, container orchestration, k8s"
series: "Container & Infra"
tags:
  - Kubernetes
  - Docker
  - Infrastructure
  - DevOps
categories:
  - infra
description: "Kubernetes 핵심 개념 정리. Pod, Deployment, Service, ConfigMap의 역할과 구조를 이해하고, Spring Boot 앱을 k8s에 배포하는 실전 예제를 단계별로 설명합니다."
---

## 왜 Kubernetes인가

[이전 Docker 포스트](/infra/2026/03/20/docker-getting-started/)에서 컨테이너를 만들고 `docker-compose`로 멀티 컨테이너 환경을 구성하는 법을 다뤘다. 로컬 개발이나 소규모 서비스에서는 충분하지만, **프로덕션 환경**에서는 금방 한계에 부딪힌다.

- 컨테이너가 죽으면 누가 다시 띄우는가?
- 트래픽이 급증하면 컨테이너를 어떻게 늘리는가?
- 새 버전을 배포할 때 다운타임 없이 교체할 수 있는가?
- 서버가 여러 대일 때 어떤 서버에 컨테이너를 배치할 것인가?

Kubernetes(이하 k8s)는 이 문제들을 **자동으로** 해결해 주는 컨테이너 오케스트레이션 플랫폼이다.

| 문제 | k8s가 제공하는 해법 |
|------|---------------------|
| 컨테이너 장애 | **Self-healing** — 컨테이너가 죽으면 자동 재시작 |
| 트래픽 급증 | **Auto Scaling** — HPA로 Pod 수를 자동 조절 |
| 무중단 배포 | **Rolling Update** — 순차적으로 새 버전 교체 |
| 서버 분산 배치 | **Scheduling** — 리소스 상태에 따라 최적 노드 배치 |

---

## 핵심 아키텍처

### Cluster

k8s의 최상위 단위. **Control Plane**(마스터)과 하나 이상의 **Worker Node**로 구성된다.

```
┌─────────────────── Cluster ───────────────────┐
│                                                │
│  ┌──── Control Plane ────┐                     │
│  │  API Server           │                     │
│  │  etcd                 │                     │
│  │  Scheduler            │                     │
│  │  Controller Manager   │                     │
│  └───────────────────────┘                     │
│                                                │
│  ┌── Worker Node 1 ──┐  ┌── Worker Node 2 ──┐ │
│  │  kubelet           │  │  kubelet           │ │
│  │  kube-proxy        │  │  kube-proxy        │ │
│  │  [Pod] [Pod]       │  │  [Pod] [Pod]       │ │
│  └────────────────────┘  └────────────────────┘ │
└────────────────────────────────────────────────┘
```

- **API Server**: 모든 요청의 진입점. `kubectl` 명령이 여기로 간다.
- **etcd**: 클러스터 상태를 저장하는 분산 key-value 저장소.
- **Scheduler**: 새 Pod를 어느 노드에 배치할지 결정.
- **Controller Manager**: Desired State와 현재 상태를 비교해 차이를 메꾼다.

### Node

실제 컨테이너가 실행되는 물리/가상 머신. 각 노드에는 **kubelet**(Pod 관리 에이전트)과 **kube-proxy**(네트워크 규칙 관리)가 동작한다.

### Pod

k8s에서 **배포 가능한 가장 작은 단위**. 하나 이상의 컨테이너를 포함하며, 같은 Pod 안의 컨테이너들은 네트워크(localhost)와 스토리지를 공유한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  containers:
    - name: app
      image: my-app:1.0
      ports:
        - containerPort: 8080
```

> 실무에서는 Pod를 직접 생성하는 일은 거의 없다. 항상 Deployment 같은 상위 오브젝트를 통해 관리한다.

### Namespace

클러스터 안에서 리소스를 **논리적으로 격리**하는 단위. 팀별, 환경별로 나눠 사용한다.

```bash
kubectl get namespaces
# NAME              STATUS   AGE
# default           Active   10d
# kube-system       Active   10d
# production        Active   5d
# staging           Active   5d
```

---

## 핵심 오브젝트

### Deployment

**Pod의 원하는 상태(Desired State)를 선언**하면, k8s가 그 상태를 유지해 준다. Pod 개수, 이미지 버전 등을 명시하면 Controller가 알아서 관리한다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3            # Pod 3개를 유지
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: app
          image: my-app:1.0
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
```

**Rolling Update**는 Deployment의 기본 배포 전략이다. `image: my-app:2.0`으로 바꾸면 k8s가 새 Pod를 하나씩 띄우고 기존 Pod를 하나씩 종료한다. 다운타임이 없다.

```bash
# 이미지 업데이트 → Rolling Update 자동 실행
kubectl set image deployment/my-app app=my-app:2.0

# 배포 상태 확인
kubectl rollout status deployment/my-app

# 문제 시 롤백
kubectl rollout undo deployment/my-app
```

### Service

Pod는 생성/삭제될 때마다 IP가 바뀐다. **Service는 Pod 집합에 대한 안정적인 네트워크 엔드포인트를 제공한다.** Label selector로 대상 Pod를 지정하고, 고정 IP(ClusterIP)와 DNS 이름을 부여한다.

| 타입 | 접근 범위 | 사용 시나리오 |
|------|-----------|---------------|
| **ClusterIP** (기본) | 클러스터 내부만 | 마이크로서비스 간 통신 |
| **NodePort** | 외부 (노드IP:포트) | 개발/테스트 환경 |
| **LoadBalancer** | 외부 (클라우드 LB) | 프로덕션 외부 노출 |

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app-service
spec:
  type: ClusterIP
  selector:
    app: my-app          # 이 label을 가진 Pod에 트래픽 전달
  ports:
    - port: 80           # Service가 받는 포트
      targetPort: 8080   # Pod에 전달하는 포트
```

### ConfigMap & Secret

**환경 설정과 민감 정보를 코드에서 분리**한다.

```yaml
# ConfigMap — 일반 설정
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  SPRING_PROFILES_ACTIVE: "production"
  LOG_LEVEL: "INFO"
---
# Secret — 민감 정보 (Base64 인코딩)
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
type: Opaque
data:
  DB_PASSWORD: cGFzc3dvcmQxMjM=    # echo -n 'password123' | base64
```

Pod에서 참조:

```yaml
spec:
  containers:
    - name: app
      image: my-app:1.0
      envFrom:
        - configMapRef:
            name: app-config
        - secretRef:
            name: db-secret
```

> ⚠️ Secret은 Base64일 뿐 암호화가 아니다. 프로덕션에서는 Sealed Secrets, Vault 등 별도 암호화 솔루션을 사용해야 한다.

---

## 자주 쓰는 kubectl 명령어

```bash
# 클러스터 정보
kubectl cluster-info
kubectl get nodes

# Pod 관리
kubectl get pods                          # Pod 목록
kubectl get pods -o wide                  # 노드 배치 정보 포함
kubectl describe pod <pod-name>           # Pod 상세 정보
kubectl logs <pod-name>                   # 로그 확인
kubectl logs <pod-name> -f                # 실시간 로그
kubectl exec -it <pod-name> -- /bin/sh    # Pod에 접속

# Deployment 관리
kubectl apply -f deployment.yaml          # 리소스 생성/업데이트
kubectl get deployments
kubectl scale deployment/my-app --replicas=5  # 스케일링
kubectl delete deployment my-app

# 디버깅
kubectl get events --sort-by='.lastTimestamp'
kubectl top pods                          # 리소스 사용량
```

---

## 실전 예제: Spring Boot 앱 k8s 배포

Docker 포스트에서 만든 Spring Boot 앱을 k8s에 배포해 보자. 하나의 파일에 Deployment와 Service를 함께 정의한다.

### k8s-deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: spring-app
  labels:
    app: spring-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: spring-app
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1           # 업데이트 시 최대 1개 추가 Pod
      maxUnavailable: 0     # 업데이트 중 사용 불가 Pod 0개 → 무중단
  template:
    metadata:
      labels:
        app: spring-app
    spec:
      containers:
        - name: spring-app
          image: my-registry/spring-app:1.0
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "1000m"
              memory: "1Gi"
          livenessProbe:
            httpGet:
              path: /actuator/health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
          envFrom:
            - configMapRef:
                name: app-config
            - secretRef:
                name: db-secret
---
apiVersion: v1
kind: Service
metadata:
  name: spring-app-service
spec:
  type: LoadBalancer
  selector:
    app: spring-app
  ports:
    - port: 80
      targetPort: 8080
      protocol: TCP
```

**핵심 포인트:**

- **livenessProbe**: 컨테이너가 살아있는지 확인. 실패하면 재시작한다.
- **readinessProbe**: 트래픽을 받을 준비가 되었는지 확인. 실패하면 Service에서 제외한다.
- **resources**: 리소스 요청(requests)과 제한(limits)을 반드시 설정해야 Scheduler가 올바르게 배치한다.
- **maxUnavailable: 0**: 업데이트 중에도 항상 3개 Pod가 가용하므로 무중단 배포가 보장된다.

### 배포 실행

```bash
# ConfigMap, Secret 먼저 생성
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml

# Deployment + Service 배포
kubectl apply -f k8s-deployment.yaml

# 확인
kubectl get all -l app=spring-app
# NAME                              READY   STATUS    RESTARTS   AGE
# pod/spring-app-6d4f8b7c9-abc12   1/1     Running   0          30s
# pod/spring-app-6d4f8b7c9-def34   1/1     Running   0          30s
# pod/spring-app-6d4f8b7c9-ghi56   1/1     Running   0          30s
#
# NAME                         TYPE           CLUSTER-IP      EXTERNAL-IP     PORT(S)
# service/spring-app-service   LoadBalancer   10.96.123.45    34.56.78.90     80:31234/TCP
#
# NAME                         READY   UP-TO-DATE   AVAILABLE   AGE
# deployment.apps/spring-app   3/3     3            3           30s
```

---

## Docker Compose vs Kubernetes

| 기준 | Docker Compose | Kubernetes |
|------|----------------|------------|
| **용도** | 로컬 개발, 단일 호스트 | 프로덕션, 멀티 호스트 |
| **스케일링** | `docker-compose up --scale app=3` (수동) | HPA로 자동 스케일링 |
| **Self-healing** | 없음 (restart 정책만 존재) | Pod 자동 재시작 + 재배치 |
| **네트워킹** | 단일 호스트 내 브리지 | 클러스터 전체 Service Discovery |
| **배포 전략** | 없음 (stop → start) | Rolling Update, Blue-Green, Canary |
| **설정 관리** | `.env` 파일 | ConfigMap, Secret |
| **학습 곡선** | 낮음 | 높음 |
| **설정 파일** | `docker-compose.yml` | 여러 YAML 매니페스트 |

이 둘은 경쟁 관계가 아니라 **보완 관계**다. 로컬에서는 Docker Compose로 빠르게 개발하고, 프로덕션에서는 k8s로 운영하는 것이 일반적인 패턴이다.

---

## 언제 k8s를 쓰고, 언제 과한가

### k8s가 적합한 경우

- 마이크로서비스 아키텍처로 서비스가 5개 이상
- 트래픽 변동이 크고 오토스케일링이 필요
- 무중단 배포(Rolling Update, Canary)가 필수
- 멀티 클라우드 또는 하이브리드 클라우드 환경
- 팀 규모가 크고 여러 서비스를 독립적으로 배포

### k8s가 과한 경우

- 모놀리식 앱 하나를 운영하는 경우
- 팀원이 1-3명이고 운영 인력이 부족한 경우
- 트래픽이 예측 가능하고 안정적인 경우
- 단순히 "이력서에 넣고 싶어서" (가장 흔한 이유...)

**대안 선택지:**
- 단일 서버: Docker Compose + Nginx
- 서버리스: AWS Lambda, Google Cloud Run
- 매니지드 PaaS: AWS ECS, Google App Engine
- 간소화된 k8s: k3s (경량 Kubernetes)

> k8s를 도입하기 전에 "이 복잡도를 감당할 운영 역량이 있는가?"를 먼저 물어보자. 도구가 문제를 해결하는 것이 아니라, 도구를 운영할 수 있는 팀이 문제를 해결한다.

---

## 마무리

Kubernetes는 단순한 배포 도구가 아니라 **선언적 인프라 관리 플랫폼**이다. "컨테이너 3개를 유지하라"고 선언하면 k8s가 알아서 상태를 맞춰주는 것이 핵심 철학이다.

이번 포스트에서 다룬 내용을 정리하면:

1. **Pod** — 배포의 최소 단위, 직접 생성하지 않는다
2. **Deployment** — Pod의 Desired State를 선언하고 Rolling Update를 관리
3. **Service** — Pod에 안정적인 네트워크 접근을 제공
4. **ConfigMap/Secret** — 설정과 민감 정보를 코드에서 분리

다음 포스트에서는 Helm Chart를 활용한 패키지 관리와 Ingress를 통한 외부 라우팅을 다룰 예정이다.

---

## 관련 포스트

- [Docker 시작하기](/infra/2026/03/20/docker-getting-started/)
- [MSA 핵심 패턴 — Circuit Breaker, API Gateway, Saga](/system-design/2026/04/03/msa-patterns/)
- [gRPC 기초 — Spring Boot 연동](/infra/2026/04/03/grpc-spring-boot/)
