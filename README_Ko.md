# Obsidian Copilot 학생용 설치 가이드

이 문서는 처음 설치하는 학생도 그대로 따라할 수 있게 만든 한글 가이드입니다.

## 0. 시작하기 전에 꼭 확인할 것

이 플러그인은 다음 조건이 필요합니다.

- 데스크톱용 Obsidian
- GitHub 계정
- GitHub Copilot 사용 권한
- Node.js
- GitHub Copilot CLI (`copilot`)

중요:

- 저장소가 `private` 이면 학생이 URL만 알아서는 설치할 수 없습니다.
- 선생님이 학생에게 GitHub 저장소 접근 권한을 먼저 줘야 합니다.
- 권한이 없으면 BRAT 설치 단계에서 저장소를 열 수 없습니다.

## 1. 준비물

### 1-1. Obsidian 설치

공식 다운로드:

- https://obsidian.md/download

설치 방법:

- Windows: `Download for Windows` 를 눌러 설치 파일(`.exe`)을 받아 실행합니다.
- macOS: `Download for Mac` 을 눌러 설치 파일(`.dmg`)을 받아 실행합니다.

설치가 끝나면 Obsidian을 한 번 실행하세요.

### 1-2. GitHub 계정과 Copilot 권한 준비

이 플러그인은 GitHub Copilot을 사용합니다.

- GitHub 계정이 있어야 합니다.
- GitHub Copilot 사용 권한이 있어야 합니다.
- 학교나 조직 계정이라면 관리자 정책에 따라 일부 모델이 보이지 않을 수 있습니다.
- 조직 계정이라면 관리자가 Copilot CLI 사용을 막아두었을 수도 있습니다.
- GitHub AI Credits와 과금/한도는 GitHub 계정 또는 조직에서 관리합니다. 이 플러그인에 보이는 사용량은 Copilot CLI 응답에서 관찰된 로컬 값일 뿐이며, 실제 남은 크레딧/청구 금액을 보장하지 않습니다.

## 2. Node.js 설치

공식 다운로드:

- https://nodejs.org/en/download/

권장:

- LTS 버전 설치
- 이 플러그인 기준으로는 Node.js 22 이상 권장

### Windows

1. 위 사이트를 엽니다.
2. `LTS` 버전을 선택합니다.
3. Windows 설치 파일을 다운로드합니다.
4. 설치 파일을 실행합니다.
5. 기본 옵션 그대로 `Next` 를 눌러 설치합니다.
6. 설치가 끝나면 `명령 프롬프트` 또는 `PowerShell` 을 엽니다.
7. 아래 명령으로 설치를 확인합니다.

```bash
node --version
npm --version
```

### macOS

1. 위 사이트를 엽니다.
2. `LTS` 버전을 선택합니다.
3. Mac 설치 파일을 다운로드합니다.
4. 설치 파일을 실행합니다.
5. 기본 옵션으로 설치를 완료합니다.
6. `Terminal` 을 엽니다.
7. 아래 명령으로 설치를 확인합니다.

```bash
node --version
npm --version
```

정상이라면 버전 번호가 표시됩니다.

## 3. GitHub Copilot CLI 설치

공식 안내 참고:

- https://docs.github.com/copilot/how-tos/copilot-cli/install-copilot-cli
- 이 플러그인은 `copilot` 단독 CLI를 사용합니다. `gh copilot` 과는 다릅니다.
- GitHub 공식 문서는 npm, Windows WinGet, macOS/Linux Homebrew 설치를 안내합니다. 이 플러그인의 자동 설치는 모든 OS에서 쓸 수 있는 npm 방식을 사용합니다.

터미널에서 아래 명령을 입력하세요.

```bash
npm install -g @github/copilot
```

Windows에서 WinGet을 쓰고 싶다면:

```powershell
winget install GitHub.Copilot
```

macOS/Linux에서 Homebrew를 쓰고 싶다면:

```bash
brew install copilot-cli
```

설치 확인:

```bash
copilot --help
copilot version
```

만약 `copilot` 명령을 찾을 수 없다고 나오면:

- 터미널을 완전히 닫았다가 다시 열어보세요.
- 그래도 안 되면 Node.js 설치가 제대로 되었는지 다시 확인하세요.
- Mac/Linux에서 npm 권한 오류가 나면 먼저 npm 전역 설치 위치를 사용자 폴더로 바꾸거나 Homebrew 설치를 고려하세요. `sudo npm install -g @github/copilot` 은 마지막 방법으로만 사용하세요.

## 4. GitHub Copilot CLI 로그인

터미널에서 아래 명령을 입력합니다.

```bash
copilot login
```

그 다음 화면 안내에 따라 로그인하세요.

먼저 `copilot` 명령으로 대화형 CLI를 실행했다면, CLI 안에서 `/login` 을 입력해도 됩니다.

정상 확인:

```bash
copilot --help
copilot version
```

또는 실제로 CLI가 실행되는지 확인합니다.

## 5. Obsidian에서 BRAT 설치

BRAT 소개:

- https://tfthacker.com/BRAT

### BRAT 설치 방법

1. Obsidian을 엽니다.
2. `설정(Settings)` 으로 들어갑니다.
3. `커뮤니티 플러그인(Community plugins)` 으로 이동합니다.
4. 커뮤니티 플러그인을 사용할 수 있게 켭니다.
5. 검색창에서 `BRAT` 을 검색합니다.
6. 설치 후 활성화합니다.

## 6. BRAT으로 Obsidian Copilot 설치

중요:

- 저장소가 private 이면 학생 계정이 해당 GitHub 저장소를 열 수 있어야 합니다.
- 선생님이 미리 collaborator 또는 team 권한을 줘야 합니다.

설치 순서:

1. Obsidian에서 `명령 팔레트` 를 엽니다.
   - Windows: `Ctrl + P`
   - macOS: `Cmd + P`
2. `BRAT: Add a beta plugin for testing` 를 실행합니다.
3. 저장소 주소를 입력합니다.

```text
https://github.com/leeht1107/obsidian-copilot
```

선생님이 수업용 fork 주소를 따로 알려준 경우에는 그 주소를 사용하세요. BRAT은 실제 릴리스 파일이 올라간 저장소 URL을 넣어야 합니다.

4. BRAT이 설치를 완료하면 `설정 -> 커뮤니티 플러그인` 으로 다시 이동합니다.
5. `Obsidian Copilot` 을 찾아 활성화합니다.

## 7. 첫 실행 전에 확인할 것

플러그인을 켜기 전에 아래를 다시 확인하세요.

```bash
node --version
npm --version
copilot --help
copilot version
copilot login
```

위 명령이 모두 정상이어야 합니다.

## 8. 플러그인 첫 실행

1. Obsidian 왼쪽 리본에서 Obsidian Copilot 아이콘을 클릭합니다.
2. 오른쪽 사이드바에 채팅 창이 열리는지 확인합니다.
3. 아무 노트나 하나 열어 둡니다.
4. 채팅창에 간단히 질문합니다.

명령 팔레트에서 찾고 싶다면 아래 검색어로 찾으면 됩니다.

- `Obsidian Copilot`
- `Obsidian Copilot: Open chat view`
- `Obsidian Copilot: Inline edit`

예시:

```text
이 노트 내용을 3줄로 요약해줘.
```

정상이라면 현재 노트가 기본 문맥으로 붙은 상태에서 Copilot 답변이 나옵니다.

## 9. 자주 하는 작업

### 현재 노트 기반으로 질문하기

- 노트를 열어 둔 상태에서 바로 질문하면 됩니다.
- 현재 열린 노트는 기본 문맥으로 자동 반영됩니다.

### 다른 노트도 함께 참고시키기

- 채팅 입력창에 `@` 를 입력합니다.
- 원하는 노트 파일을 선택합니다.
- 선택한 파일이 추가 문맥으로 함께 전달됩니다.

### 선택한 문장만 고치기

- 노트에서 문장을 드래그해 선택합니다.
- Inline Edit 기능을 실행합니다.
- 예: `더 자연스럽게 고쳐줘`, `학생 발표용 문체로 바꿔줘`

## 10. 문제 해결

### `node` 또는 `npm` 명령이 안 됩니다

- Node.js 설치가 끝난 뒤 터미널을 다시 열어보세요.
- 그래도 안 되면 Node.js를 다시 설치하세요.

### `copilot` 명령이 안 됩니다

- 아래 명령을 다시 실행하세요.

```bash
npm install -g @github/copilot
```

- 설치 후 터미널을 다시 열어보세요.
- Mac/Linux 권한 오류라면 `sudo` 를 바로 쓰기보다 npm 전역 설치 위치 수정 또는 Homebrew 설치를 먼저 시도하세요.
- 그래도 수업 중 바로 해결해야 한다면 Mac/Linux에서만 마지막 방법으로 `sudo npm install -g @github/copilot` 을 사용할 수 있습니다.

### 로그인은 했는데 플러그인이 응답하지 않습니다

- 먼저 터미널에서 `copilot --help` 가 정상인지 확인하세요.
- GitHub Copilot 권한이 있는 계정으로 로그인했는지 확인하세요.

### BRAT에서 저장소를 찾지 못합니다

- 저장소가 private 이면 접근 권한이 있어야 합니다.
- 선생님이 GitHub에서 학생 계정을 collaborator 또는 team 으로 추가했는지 확인해야 합니다.

### Obsidian에서 플러그인이 안 보입니다

- BRAT 설치 후 `커뮤니티 플러그인` 목록을 새로고침하세요.
- 그래도 안 보이면 Obsidian을 완전히 종료 후 다시 실행하세요.

## 11. 공식 링크 모음

- Node.js 다운로드: https://nodejs.org/en/download/
- Obsidian 다운로드: https://obsidian.md/download
- GitHub Copilot CLI 설치: https://docs.github.com/copilot/how-tos/copilot-cli/install-copilot-cli
- GitHub Copilot AI Credits/과금: https://docs.github.com/en/copilot/concepts/billing
- BRAT 소개: https://tfthacker.com/BRAT

## 12. 가장 짧은 설치 체크리스트

아래 순서대로 하면 됩니다.

1. Obsidian 설치
2. Node.js 설치
3. `npm install -g @github/copilot`
4. `copilot login`
5. Obsidian에서 BRAT 설치
6. BRAT으로 `https://github.com/leeht1107/obsidian-copilot` 추가
7. `Obsidian Copilot` 활성화
8. 노트를 열고 질문해 보기
