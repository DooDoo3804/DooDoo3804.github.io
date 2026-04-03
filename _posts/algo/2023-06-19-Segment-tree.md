---
title: "Segment tree"
subtitle: "Implement a segment tree"
layout: post
author: "DoYoon Kim"
header-style: text
keywords: "Jekyll, 블로그, 개발, 알고리즘, algorithm, segment"
series: "알고리즘"
tags:
  - Algorithm
  - Tree
categories: [algorithm]
description: "세그먼트 트리의 개념, 크기 계산, C++ 구현 방법을 정리합니다. 배열 기반 풀 바이너리 트리에서 초기화, 값 갱신, 구간 합 쿼리를 처리하는 과정을 코드와 함께 단계별로 설명합니다."
---

세그먼트 트리란
---
주어진 쿼리에 대해 빠르게 응답하기 위해 만들어진 자료구조이다.
<br>따라서 많은 쿼리가 반복되는 상황에 유리하다.
<br>

### 세그먼트 트리의 전체 크기
크기가 N인 배열에 대해

```
트리의 높이 - ceil(log2(N))
세그먼트 트리의 크기 - 1 << (트리의 높이 + 1)
```
<br>
### 세그먼트 트리생성
세그먼트 트리는 full binary tree에 가깝기에 배열에 모든 값들이 꽉차서 올 가능성이 매우 높다.
<br>포인터보다는 배열을 사용하여 작성한다.
```                                
         1
       ⁄   ∖
     2       3
    ⁄  ∖    ⁄  ∖
  4     5  6    7
```
루트 노드 = 1로 생각한다.
<br>이때 루트 노드의 왼쪽은 2번, 오른쪽은 3번이 된다.
<br>2번 노드의 왼쪽은 4번, 오른쪽은 5번이 된다.
<br>3번 노드의 왼쪽은 6번, 오른쪽은 7번이 된다...

```
|현재 노드가 node라면|
노드의 왼쪽 자식 배열 번호 : node * 2
노드의 오른쪽 자식 배열 번호 : node * 2 + 1
```


세그먼트 트리 구현
---
[ with <B>`C++`</B> ]
<br>아래 코드에서 tree 배열은 세그먼트 트리가 만들어지는 배열
<br>arr 배열은 처음에 입력받아 생성된 배열을 의미한다.
### <b>1. 초기화 과정 (init)</b>
```c++
long long init(vector<long long> &arr, vector<long long> &tree, int node, int start, int end) {
    if (start == end) return tree[node] = arr[start];
    int mid = (end + start) / 2;
    return tree[node] = init(arr, tree, node * 2, start, mid) + init(arr, tree, node * 2 + 1, mid + 1, end);
}
```

### <b>2. 갱신 과정 (update)</b>
```c++
void update(vector<long long> &tree, int node, int start, int end, int index, long long diff) {
    if (!(start <= index && index <= end)) return;
    tree[node] += diff;
    if (start != end) {
        int mid = (start + end) / 2;
        update(tree, node * 2, start, mid, index, diff);
        update(tree, node * 2 + 1, mid + 1, end, index, diff);
    }
}
```

### <b>3. 합 과정 (sum)</b> 
이 부분은 `쿼리`에 따라 달라질 수 있다.
```c++
long long sum(vector<long long> &tree, int node, int start, int end, int left, int right) {
    if (left > end || right < start) return 0;
    if (left <= start && end <= right) return tree[node];
    int mid = (start + end) / 2;
    return sum(tree, node * 2, start, mid, left, right) + sum(tree, node * 2 + 1, mid + 1, left, right);
}
```

---

## 관련 포스트

- [Trie 자료구조 — 문자열 검색에 최적화된 트리 구조](/algorithm/2026/04/01/trie/)
