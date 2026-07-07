# Fairy Fox Games — Jekyll build (mesh the games via collections + tags).
# The playable games are static and pass through untouched; Jekyll generates the
# landing, changelog, tag pages, and shared chrome. Deployed by GitHub Actions
# (see .github/workflows), same as the fairyfox.io hub.
source "https://rubygems.org"

gem "jekyll", "~> 4.3"

group :jekyll_plugins do
  gem "jekyll-redirect-from", "~> 0.16"
end

# Windows / JRuby timezone data + faster file watching locally.
platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end
gem "wdm", "~> 0.1", platforms: [:mingw, :x64_mingw, :mswin]
