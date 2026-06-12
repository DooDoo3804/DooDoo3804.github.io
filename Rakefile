# Rakefile — minimal local helpers.
# Post scaffolding lives in scripts/new-post.sh (this file's old hux-blog
# `post` task was a duplicate and has been removed).
# NOTE: Rakefile is excluded from the Jekyll build via _config.yml.

desc "Serve the site locally with live reload"
task :preview do
  system "bundle exec jekyll serve"
end

task default: :preview
