PASSWORD ?= $(error PASSWORD is required. Usage: PASSWORD=mypassword make build)

.PHONY: build serve clean

build:
	bundle exec jekyll build
	bash scripts/encrypt-pages.sh "$(PASSWORD)"

serve:
	bundle exec jekyll serve

clean:
	bundle exec jekyll clean
