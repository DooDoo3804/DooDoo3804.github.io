---
title: "Spring Batch 입문: Job·Step·Chunk 구조와 대량 데이터 처리 전략"
subtitle: "배치와 스케줄러의 차이부터 Chunk 기반 구현, 재시작/재시도, Quartz 연동까지"
layout: post
date: "2026-10-13"
author: "DoYoon Kim"
header-style: text
catalog: true
series: "Spring 심화"
keywords: "spring batch, job, step, chunk, tasklet, quartz, backend"
tags:
  - Spring
  - Spring Batch
  - Backend
  - Java
categories:
  - spring
description: "Spring Batch의 Job·Step·Chunk 구조와 배치/스케줄러의 차이를 정리하고, 대량 유저 데이터 갱신 예제로 Chunk 기반 구현, Parallel 처리, 재시작/재시도 전략, Quartz 연동까지 다룹니다."
---

## 들어가며

새벽 배치로 전체 유저의 등급을 재계산하거나, 수백만 건의 로그를 집계해서 통계 테이블에 쌓는 작업을 `for` 문과 수동 트랜잭션으로 직접 짜본 적이 있다면, 실패한 지점부터 다시 시작하는 로직이나 중간 커밋 처리가 금방 복잡해진다는 걸 알 것이다. **Spring Batch**는 이런 대량 데이터 처리를 위한 표준 프레임워크로, 실행 상태 추적·재시작·청크 단위 트랜잭션·재시도/건너뛰기 전략을 프레임워크 레벨에서 제공한다.

이 글은 Spring Batch를 처음 접하는 백엔드 개발자를 대상으로, 핵심 도메인 모델부터 Chunk 기반 구현, 대용량 처리를 위한 전략, 그리고 실행을 트리거하는 스케줄링 연동까지 순서대로 정리한다. 버전은 Spring Boot 3.x 기준(Spring Batch 5.x)이다.

---

## 배치 프로그램과 스케줄러는 다르다

Spring Batch를 처음 보면 "그냥 스케줄러 아닌가?"라는 생각이 들기 쉽다. 하지만 **배치 프로그램**과 **스케줄러**는 서로 다른 축의 개념이다.

| 구분 | 배치 프로그램 | 스케줄러 |
|------|---------------|----------|
| 역할 | 대량 데이터를 일괄 처리하는 로직 그 자체 | 그 로직을 "언제" 실행할지 결정 |
| 실행 조건 | 실행 명령(트리거)이 있을 때 동작 | 정해진 시간/주기/조건에 따라 자동 실행 |
| 예시 | 대량 유저 데이터 갱신, 로그 집계, 데이터 마이그레이션 | Quartz, cron, Jenkins 스케줄 |

즉 배치 프로그램은 "무엇을 처리할지"에 대한 답이고, 스케줄러는 "언제 처리를 트리거할지"에 대한 답이다. **Spring Batch는 배치 프로그램만 제공하며, 스케줄링 기능은 포함하지 않는다.** 그래서 실무에서는 Spring Batch Job을 Quartz, cron(`@Scheduled`), Jenkins 같은 별도 트리거와 조합해서 사용한다. 이 조합은 글 마지막 [Quartz 연동](#배치-job-실행-트리거하기-quartz-연동) 섹션에서 다룬다.

배치 프로그램은 보통 다음과 같은 상황에서 사용된다.

- 대량 데이터 처리 (대규모 DB 테이블, 로그 파일 집계)
- 자동화된 일괄 작업 (유저 등급/포인트 재계산, 정산)
- 분산/병렬 처리가 필요한 대용량 작업
- 재시도·재시작이 필요한 안정적인 데이터 처리
- 데이터 마이그레이션, 백업/복원, 배치성 분석

---

## 핵심 도메인 모델: Job, Step, 그리고 메타데이터

Spring Batch의 실행 단위는 계층적으로 구성된다.

```
Job ─┬─ JobInstance (JobParameters로 구분되는 실행 단위)
     │     └─ JobExecution (JobInstance의 한 번의 실행 시도)
     │
     └─ Step (Job을 구성하는 하위 단계, 순차 실행)
           └─ StepExecution (Step의 한 번의 실행 시도)
                 └─ ExecutionContext (Step/Job 간 공유되는 상태 저장소)

JobRepository  — 위 모든 메타데이터를 저장/관리
JobLauncher    — JobParameters와 함께 Job을 실행시키는 진입점
```

각 구성요소의 역할은 다음과 같다.

- **Job**: 전체 배치 처리를 추상화한 최상위 개념. 하나 이상의 `Step`을 순서대로 포함하며, Job 자체는 재사용 가능한 정의일 뿐 실행 상태를 갖지 않는다.
- **JobInstance**: Job의 논리적 실행 단위. `JobParameters`가 같으면 같은 `JobInstance`로 취급된다. 예를 들어 "2026-10-13에 실행한 유저 등급 갱신 Job"이 하나의 JobInstance다.
- **JobParameters**: JobInstance를 구별하는 데 쓰이는 파라미터. `String`, `Double`, `Long`, `Date` 네 가지 타입만 지원한다. 같은 Job을 매일 실행하려면 날짜/시간처럼 매번 달라지는 값을 파라미터에 포함시켜야 한다(그렇지 않으면 "이미 완료된 JobInstance" 충돌이 난다 — 뒤에서 다시 다룬다).
- **JobExecution**: JobInstance를 "실행한 한 번의 시도"에 대한 상태(시작/종료 시간, 성공/실패 여부)를 담는다. 같은 JobInstance라도 실패 후 재시도하면 새로운 JobExecution이 생긴다.
- **JobRepository**: Job/Step 실행과 관련된 모든 메타데이터(JobInstance, JobExecution, StepExecution, ExecutionContext)를 영속화하는 메커니즘. `BATCH_JOB_INSTANCE`, `BATCH_JOB_EXECUTION`, `BATCH_STEP_EXECUTION` 등의 메타데이터 테이블을 통해 관리된다. Spring Boot 3.x에서는 `spring-boot-starter-batch` 의존성만 추가하면 `JobRepository`, `JobLauncher`, `PlatformTransactionManager` 빈이 자동 구성되고, `spring.batch.jdbc.initialize-schema` 설정으로 메타데이터 테이블의 자동 생성 여부를 제어할 수 있다(기본값은 `embedded`로, 임베디드 DB에서만 자동 생성).
- **JobLauncher**: `Job`과 `JobParameters`를 받아 실행을 시작시키는 인터페이스. 내부적으로 JobRepository를 통해 실행 상태를 기록한다.
- **Step**: Job의 하위 단계이며, 실제 처리가 일어나는 최소 단위. 하나의 Job은 하나 이상의 Step으로 구성되고, 각 Step은 `Tasklet` 또는 `Chunk` 방식으로 구현한다.
- **StepExecution**: Step의 한 번의 실행 시도에 대한 상태. 읽은 아이템 수(ReadCount), 쓴 아이템 수(WriteCount), 건너뛴 아이템 수(SkipCount) 등 세부 통계를 포함한다.
- **ExecutionContext**: Step 또는 Job 실행 도중의 상태를 key-value로 저장하는 공간. Job이 중간에 실패했을 때, 이 ExecutionContext에 저장된 마지막 상태를 기반으로 재시작 시점을 복원한다.

---

## Tasklet vs Chunk: 언제 무엇을 쓸까

Step의 처리 방식은 크게 두 가지다.

### Tasklet

**하나의 트랜잭션 안에서 단일 작업을 한 번에 처리**하는 방식이다. `Tasklet` 인터페이스의 `execute()` 메서드가 `RepeatStatus.FINISHED`를 반환할 때까지 반복 호출된다.

```java
@Component
public class FileArchiveTasklet implements Tasklet {

    @Override
    public RepeatStatus execute(StepContribution contribution, ChunkContext chunkContext) {
        // 파일 이동, 알림 발송처럼 "한 번만" 처리하면 되는 단순 작업
        archiveYesterdayLogFile();
        return RepeatStatus.FINISHED;
    }
}
```

파일 압축/이동, 외부 API 호출, 사전 초기화처럼 **대량 데이터를 반복 처리할 필요가 없는 단순 작업**에 적합하다. 반대로 수백만 건의 레코드를 한 트랜잭션으로 처리하려 들면 메모리와 트랜잭션 로그 부담이 커지므로, 대용량 데이터 처리에는 부적합하다.

### Chunk

**레코드를 일정 개수(Chunk)로 묶어서, 묶은 단위를 하나의 트랜잭션으로 처리**하는 방식이다. 대량 데이터를 한 번에 메모리에 올리지 않기 때문에 메모리 부하가 적고, 실패 시 해당 Chunk만 롤백하면 되므로 대용량 처리에 적합하다.

```
[Chunk 기반 Step 처리 흐름]

ItemReader ──1건씩──▶ ItemProcessor ──가공──▶ ItemWriter
   │                                              │
   └── Chunk 크기(예: 1000건)만큼 모일 때까지 반복 ──┘
                                                   │
                                     ◀── 1000건 단위로 커밋 ──┘
```

- **ItemReader**: 데이터를 한 건씩 읽어온다 (DB, 파일, 큐 등)
- **ItemProcessor**: 읽어온 데이터를 가공하거나 필터링한다 (선택적 — 생략 가능)
- **ItemWriter**: 가공된 데이터를 Chunk 단위로 모아서 저장한다

Reader가 Chunk 크기만큼 아이템을 읽으면, Processor를 거쳐 Writer가 한 번에 쓰고 커밋한다. **Chunk 크기 = 커밋 간격(commit interval) = 트랜잭션 경계**라는 점이 핵심이다. 크기를 너무 작게 잡으면 커밋이 잦아져 오버헤드가 커지고, 너무 크게 잡으면 트랜잭션 하나가 실패했을 때 롤백 비용과 재처리 비용이 커진다.

| | Tasklet | Chunk |
|---|---------|-------|
| 트랜잭션 단위 | Step 전체 (또는 Tasklet 호출 1회) | Chunk 크기만큼 |
| 적합한 작업 | 단일/단순 작업 (파일 이동, 알림) | 대량 레코드 반복 처리 |
| 대용량 적합성 | 낮음 | 높음 |
| 부분 실패 복구 | Step 전체 재실행 | 실패한 Chunk부터 재시작 가능 |

---

## Chunk 기반 구현 예제: 대량 유저 등급 갱신 배치

누적 구매 금액을 기준으로 전체 유저의 등급을 재계산하는 배치를 Chunk 방식으로 구현해보자. 의존성은 다음과 같다.

```gradle
implementation 'org.springframework.boot:spring-boot-starter-batch'
```

> 아래 예제는 second-brain 노트의 구현부가 미완 상태였던 부분을 [Spring Batch 공식 문서](https://docs.spring.io/spring-batch/reference/)와 Spring Boot 3.x(Spring Batch 5.x) API를 기준으로 새로 작성한 내용이다. `JobBuilder`/`StepBuilder`가 `JobRepository`를 직접 받는 생성자, `chunk(size, transactionManager)` 시그니처는 Spring Batch 5부터 적용된 API다 (이전 버전의 `JobBuilderFactory`/`StepBuilderFactory`는 Spring Boot 3에서 제거됐다).

```java
@Configuration
@RequiredArgsConstructor
public class UserGradeUpdateJobConfig {

    private final JobRepository jobRepository;
    private final PlatformTransactionManager transactionManager;
    private final EntityManagerFactory entityManagerFactory;

    @Bean
    public Job userGradeUpdateJob(Step userGradeUpdateStep) {
        return new JobBuilder("userGradeUpdateJob", jobRepository)
                .start(userGradeUpdateStep)
                .build();
    }

    @Bean
    public Step userGradeUpdateStep(
            ItemReader<User> userReader,
            ItemProcessor<User, User> userGradeProcessor,
            ItemWriter<User> userWriter
    ) {
        return new StepBuilder("userGradeUpdateStep", jobRepository)
                .<User, User>chunk(1000, transactionManager)
                .reader(userReader)
                .processor(userGradeProcessor)
                .writer(userWriter)
                .build();
    }

    @Bean
    public JpaPagingItemReader<User> userReader() {
        return new JpaPagingItemReaderBuilder<User>()
                .name("userReader")
                .entityManagerFactory(entityManagerFactory)
                .queryString("SELECT u FROM User u WHERE u.active = true ORDER BY u.id")
                .pageSize(1000)
                .build();
    }

    @Bean
    public ItemProcessor<User, User> userGradeProcessor() {
        return user -> {
            Grade newGrade = Grade.calculateBy(user.getTotalPurchaseAmount());
            user.changeGrade(newGrade);
            return user;
        };
    }

    @Bean
    public JpaItemWriter<User> userWriter() {
        JpaItemWriter<User> writer = new JpaItemWriter<>();
        writer.setEntityManagerFactory(entityManagerFactory);
        return writer;
    }
}
```

- `userReader`는 `active = true`인 유저를 PK 순서로 페이징 조회한다. `JpaPagingItemReader`는 `ItemStream`도 구현하고 있어서, 현재까지 읽은 위치를 `ExecutionContext`에 저장한다 — 이 점이 재시작 전략에서 중요해진다 (다음 섹션).
- `userGradeProcessor`는 순수 가공 로직만 담당한다. DB 접근이나 트랜잭션 제어는 신경 쓸 필요가 없다 — Chunk 단위 커밋은 프레임워크가 처리한다.
- `userWriter`는 `JpaItemWriter`를 사용해 영속성 컨텍스트에 merge/flush한다. Chunk(1000건)가 다 쓰여지면 Step에 전달된 `transactionManager`로 커밋된다.

---

## 안정적인 대량 처리를 위한 전략: Skip, Retry, 재시작

실무 배치에서는 "일부 레코드 오류로 전체 Job을 실패시킬 것인가"와 "Job이 중간에 죽었을 때 어디서부터 다시 시작할 것인가"를 반드시 결정해야 한다.

### Skip과 Retry

`faultTolerant()`를 통해 장애 허용 정책을 Step에 추가할 수 있다.

```java
@Bean
public Step userGradeUpdateStep(/* ... */) {
    return new StepBuilder("userGradeUpdateStep", jobRepository)
            .<User, User>chunk(1000, transactionManager)
            .reader(userReader)
            .processor(userGradeProcessor)
            .writer(userWriter)
            .faultTolerant()
            .retry(OptimisticLockingFailureException.class)
            .retryLimit(3)
            .skip(DataIntegrityViolationException.class)
            .skipLimit(20)
            .build();
}
```

- **Retry**: 지정한 예외가 발생하면 같은 아이템 처리를 `retryLimit` 횟수만큼 재시도한다. 낙관적 락 충돌처럼 "다시 하면 성공할 수도 있는" 일시적 오류에 사용한다.
- **Skip**: 재시도 후에도(또는 바로) 실패하면 해당 아이템만 건너뛰고 나머지 Chunk 처리를 계속한다. `skipLimit`을 넘기면 Step 전체가 실패로 처리된다. 건너뛴 아이템은 `SkipListener`로 로깅해서 추적할 수 있다.

### 재시작(Restart)

Spring Batch의 재시작은 **JobInstance 식별 규칙**과 **ExecutionContext 복원**이라는 두 가지 메커니즘으로 동작한다.

```
[재시작 흐름]

1차 실행: JobParameters{date=2026-10-13} → JobInstance A 생성
          └─ 800번째 레코드 처리 중 서버 장애로 실패 (JobExecution #1: FAILED)
              └─ ExecutionContext에 "마지막 읽은 위치" 저장됨

재실행: 같은 JobParameters{date=2026-10-13}로 재실행
        └─ 같은 JobInstance A 인식
            └─ JobExecution #2 생성, ExecutionContext에서 마지막 위치부터 재개
                └─ 800번째 레코드부터 다시 처리 (0~799는 재처리하지 않음)
```

주의할 점이 두 가지 있다.

1. **같은 JobParameters로 "성공 완료"된 JobInstance를 다시 실행하면 `JobInstanceAlreadyCompleteException`이 발생한다.** 매일 반복 실행되는 배치라면 날짜/타임스탬프처럼 실행마다 달라지는 값을 JobParameters에 반드시 포함해야 한다. 그렇지 않으면 "오늘 이미 돌렸다"고 판단해 두 번째 실행을 거부한다.
2. 알림 발송처럼 "실패 여부와 무관하게 재시작 시에도 다시 실행되어야 하는" Step이 있다면 `.allowStartIfComplete(true)`를 설정해, Job이 재시작될 때 이미 완료된 Step이라도 다시 실행되도록 할 수 있다.

---

## 처리 속도를 높이는 Parallel 전략: Multi-thread Step과 Partitioning

Chunk 하나를 처리하는 속도가 충분히 빨라도, 전체 레코드 수가 수천만 건 단위면 순차 처리만으로는 배치 윈도우 시간 안에 끝내기 어려울 수 있다. Spring Batch는 Step을 병렬화하는 몇 가지 방법을 제공한다.

### Multi-thread Step

`.taskExecutor()`로 스레드 풀을 지정하면 하나의 Step 안에서 여러 Chunk를 동시에 처리할 수 있다.

```java
@Bean
public Step userGradeUpdateStep(/* ... */) {
    return new StepBuilder("userGradeUpdateStep", jobRepository)
            .<User, User>chunk(1000, transactionManager)
            .reader(new SynchronizedItemStreamReader<>(userReader)) // Reader는 기본적으로 Thread-safe하지 않다
            .processor(userGradeProcessor)
            .writer(userWriter)
            .taskExecutor(new SimpleAsyncTaskExecutor("batch-thread-"))
            .build();
}
```

가장 간단하지만, 표준 `ItemReader` 구현체(예: `JpaPagingItemReader`)는 Thread-safe하지 않으므로 `SynchronizedItemStreamReader`로 감싸서 읽기 동작을 동기화해야 한다. 결국 읽기 자체는 순차적으로 일어나기 때문에, Reader가 병목인 경우 체감 효과가 크지 않을 수 있다.

### Partitioning (일명 "Parallel Chunk")

더 확실하게 병렬 처리량을 늘리는 방법은 **Partitioning**이다. 데이터를 범위별로 나눠서, 각 범위를 독립된 Worker Step이 각자의 Reader/Writer로 동시에 처리하게 만드는 Master-Worker 패턴이다.

```
[Partitioning 구조]

                 ┌── Worker Step (id 1 ~ 250,000) ──┐
Partitioner ─────┼── Worker Step (id 250,001 ~ 500,000) ──┼──▶ 동시 실행
  (범위 분할)      ├── Worker Step (id 500,001 ~ 750,000) ──┤
                 └── Worker Step (id 750,001 ~ 1,000,000) ─┘
```

```java
@Bean
public Step partitionedUserGradeUpdateStep(Step userGradeUpdateStep) {
    return new StepBuilder("partitionedUserGradeUpdateStep", jobRepository)
            .partitioner("userGradeUpdateStep", userIdRangePartitioner())
            .step(userGradeUpdateStep)
            .taskExecutor(new SimpleAsyncTaskExecutor("batch-partition-"))
            .gridSize(4)
            .build();
}

@Bean
public Partitioner userIdRangePartitioner() {
    return gridSize -> {
        long minId = userRepository.findMinId();
        long maxId = userRepository.findMaxId();
        long rangeSize = (maxId - minId) / gridSize + 1;

        Map<String, ExecutionContext> partitions = new HashMap<>();
        for (int i = 0; i < gridSize; i++) {
            long start = minId + (i * rangeSize);
            long end = Math.min(start + rangeSize - 1, maxId);

            ExecutionContext context = new ExecutionContext();
            context.putLong("minId", start);
            context.putLong("maxId", end);
            partitions.put("partition" + i, context);
        }
        return partitions;
    };
}
```

각 Worker Step의 Reader는 `ExecutionContext`에 담긴 `minId`/`maxId`를 `@Value("#{stepExecutionContext['minId']}")`처럼 주입받아 자신이 맡은 범위만 조회하도록 구성한다. 이렇게 하면 각 Worker가 독립적인 트랜잭션과 독립적인 Reader 상태를 가지므로 Multi-thread Step보다 확실한 병렬성을 얻을 수 있다. 여기서는 로컬 스레드 풀(`TaskExecutorPartitionHandler`)을 사용했지만, 처리량을 더 늘려야 한다면 메시징 미들웨어를 통해 여러 서버/프로세스로 Worker를 분산시키는 **Remote Partitioning**도 고려할 수 있다 — 다만 이는 별도 인프라가 필요한 주제이므로 이 글의 범위를 벗어난다.

---

## 배치 Job 실행 트리거하기: Quartz 연동

앞서 짚었듯 Spring Batch는 스케줄링 기능을 제공하지 않는다. Job을 "언제" 실행할지는 별도의 트리거가 결정해야 한다.

가장 가벼운 방법은 Spring의 `@Scheduled`로 직접 `JobLauncher`를 호출하는 것이다.

```java
@Component
@RequiredArgsConstructor
public class UserGradeUpdateScheduler {

    private final JobLauncher jobLauncher;
    private final Job userGradeUpdateJob;

    @Scheduled(cron = "0 0 2 * * *") // 매일 새벽 2시
    public void run() throws Exception {
        JobParameters params = new JobParametersBuilder()
                .addLong("runTime", System.currentTimeMillis())
                .toJobParameters();
        jobLauncher.run(userGradeUpdateJob, params);
    }
}
```

단순하지만 트리거 상태가 영속화되지 않고(서버 재시작 시 misfire 복구 불가), 클러스터 환경에서 여러 인스턴스가 동시에 같은 Job을 중복 실행할 위험이 있다. 트리거 자체의 영속성·클러스터링·misfire 정책이 필요하다면 **Quartz**가 더 적합하다.

```gradle
implementation 'org.springframework.boot:spring-boot-starter-quartz'
```

```java
public class UserGradeUpdateQuartzJob extends QuartzJobBean {

    @Autowired
    private JobLauncher jobLauncher;

    @Autowired
    private Job userGradeUpdateJob;

    @Override
    protected void executeInternal(org.quartz.JobExecutionContext context) throws JobExecutionException {
        try {
            JobParameters params = new JobParametersBuilder()
                    .addLong("runTime", System.currentTimeMillis())
                    .toJobParameters();
            jobLauncher.run(userGradeUpdateJob, params);
        } catch (Exception e) {
            throw new JobExecutionException(e);
        }
    }
}
```

```java
@Configuration
public class QuartzConfig {

    @Bean
    public JobDetail userGradeUpdateJobDetail() {
        return org.quartz.JobBuilder.newJob(UserGradeUpdateQuartzJob.class)
                .withIdentity("userGradeUpdateJobDetail")
                .storeDurably()
                .build();
    }

    @Bean
    public Trigger userGradeUpdateTrigger(JobDetail userGradeUpdateJobDetail) {
        return TriggerBuilder.newTrigger()
                .forJob(userGradeUpdateJobDetail)
                .withIdentity("userGradeUpdateTrigger")
                .withSchedule(CronScheduleBuilder.cronSchedule("0 0 2 * * ?"))
                .build();
    }
}
```

> **주의**: Quartz를 Spring Batch와 함께 쓰면 **같은 이름의 클래스가 두 개 생긴다.** `org.quartz.JobBuilder`/`org.quartz.JobExecutionContext`와 Spring Batch의 `org.springframework.batch.core.job.builder.JobBuilder`/`org.springframework.batch.core.JobExecution`은 완전히 다른 클래스다. IDE 자동 완성이 엉뚱한 쪽을 import하기 쉬우므로, 위 예제처럼 패키지를 명시하거나 import 구문을 각별히 확인해야 한다.

Quartz의 `Trigger`가 매일 새벽 2시에 `UserGradeUpdateQuartzJob`을 실행시키고, 그 안에서 `runTime`(실행 시각 타임스탬프)을 JobParameters에 넣어 매번 새로운 JobInstance로 인식되게 만든다 — 이렇게 하지 않으면 앞서 언급한 `JobInstanceAlreadyCompleteException`에 걸려 둘째 날부터 Job이 실행되지 않는다.

---

## 마무리

Spring Batch는 "대량 데이터를 안전하게, 재시작 가능하게, 필요하면 병렬로 처리한다"는 문제를 Job/Step/Chunk라는 계층 구조와 JobRepository의 상태 추적으로 풀어낸다. 정리하면:

- 배치 프로그램과 스케줄러는 다른 개념이다 — Spring Batch는 전자만 담당한다.
- 단순 단일 작업은 Tasklet, 대량 레코드 반복 처리는 Chunk(Reader-Processor-Writer)를 쓴다.
- Chunk 크기는 곧 트랜잭션(커밋) 단위다.
- Skip/Retry로 장애를 흡수하고, JobParameters와 ExecutionContext로 정확한 지점부터 재시작한다.
- 처리량이 부족하면 Multi-thread Step보다 Partitioning이 더 확실한 병렬화 수단이다.
- 실행 트리거는 별도 몫이다 — 가볍게는 `@Scheduled`, 영속성/클러스터링이 필요하면 Quartz.

Chunk Writer에서 실제로 레코드를 저장할 때는 결국 JPA/트랜잭션 메커니즘 위에서 동작하므로, [JPA N+1 문제](/2026/04/04/jpa-n-plus-one-problem/)와 [트랜잭션 전파 레벨](/2026/04/04/spring-transaction-propagation/)을 함께 이해하고 있으면 Chunk Writer 성능 튜닝이나 Step 트랜잭션 경계 설계에 도움이 된다.

---

## 관련 포스트

- [Spring 트랜잭션 전파 레벨 완전 정복](/2026/04/04/spring-transaction-propagation/)
- [JPA N+1 문제 완전 정복](/2026/04/04/jpa-n-plus-one-problem/)
- [Spring Bean 라이프사이클 완전 정복](/2026/04/05/spring-bean-lifecycle/)
