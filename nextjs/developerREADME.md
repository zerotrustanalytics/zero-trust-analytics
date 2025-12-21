# Developer README - Hugo 2025 Starter Template

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Project Structure](#project-structure)
4. [Configuration](#configuration)
5. [Layout System](#layout-system)
6. [Partial Components](#partial-components)
7. [Content Management](#content-management)
8. [Asset Pipeline](#asset-pipeline)
9. [Styling System](#styling-system)
10. [JavaScript](#javascript)
11. [SEO & Metadata](#seo--metadata)
12. [Netlify CMS](#netlify-cms)
13. [Deployment](#deployment)
14. [Creating New Pages](#creating-new-pages)
15. [Customization Guide](#customization-guide)

---

## Overview

This is a Hugo static site generator template built with Bootstrap 5, SCSS preprocessing, and Netlify CMS integration. The template is designed for easy deployment to Netlify and includes built-in SEO optimization, accessibility features, and a content management system.

**Hugo Version:** 0.147.4

---

## Prerequisites

Before working with this template, ensure you have:

- **Hugo Extended** version 0.147.4 or higher installed
- **Node.js** (for SCSS compilation if needed)
- **Git** for version control
- A **GitHub account** (for Netlify CMS integration)
- A **Netlify account** (for deployment)

---

## Project Structure

```
2025HugoStarter/
├── archetypes/          # Content templates
│   └── default.md       # Default archetype for new content
├── assets/              # Source files (SCSS, JS) - processed by Hugo
│   └── src/
│       ├── scss/        # SCSS source files
│       │   ├── shared/  # Shared SCSS partials
│       │   └── home.scss
│       └── js/
│           └── menu.js  # Custom JavaScript
├── content/             # Markdown content files
│   ├── _index.md        # Homepage content
│   ├── accessibility-statement.html
│   ├── privacy-policy.html
│   └── terms-of-use.html
├── layouts/             # HTML templates
│   ├── _default/        # Default templates
│   │   ├── baseof.html  # Base template (wrapper)
│   │   ├── single.html  # Single page template
│   │   └── list.html    # List page template
│   ├── partials/        # Reusable components
│   │   ├── head.html    # <head> section
│   │   ├── header.html  # Site header
│   │   ├── footer.html  # Site footer
│   │   ├── foot.html    # Scripts before </body>
│   │   ├── cta.html     # Call-to-action component
│   │   └── seo_schema.html # SEO meta tags
│   ├── terms/           # Legal pages templates
│   │   ├── accessibility-statement.html
│   │   ├── privacy-policy.html
│   │   └── terms-of-use.html
│   ├── index.html       # Homepage template
│   ├── robots.txt       # Robots.txt template
│   └── sitemap.xml      # Custom sitemap template
├── static/              # Static files (copied as-is to public/)
│   ├── admin/           # Netlify CMS admin panel
│   │   ├── config.yml   # CMS configuration
│   │   └── index.html   # CMS interface
│   ├── src/
│   │   ├── css/         # Compiled CSS & Bootstrap
│   │   │   └── bootstrap/
│   │   └── js/          # JavaScript libraries
│   │       └── bootstrap/
│   └── _redirects       # Netlify redirects
├── public/              # Generated site (do not edit)
├── resources/           # Hugo cache (do not edit)
├── .hugo-version        # Hugo version lock file
├── hugo.toml            # Hugo configuration
├── netlify.toml         # Netlify build configuration
└── README.md            # User-facing README
```

---

## Configuration

### hugo.toml

The main Hugo configuration file located at the root of the project.

```toml
baseURL = 'https://example.org/'
languageCode = 'en-us'
title = 'My New Hugo Site'

[params]
CompanyName = 'My Hugo Site'
repoName = 'GitRepoName'

[environments.development]
baseURL = 'http://localhost:1313/'

[environments.production]
baseURL = 'https://example.org/'
```

**Key Settings:**
- `baseURL`: Your production site URL (update this!)
- `languageCode`: Language code for the site
- `title`: Site title (used in SEO)
- `params.CompanyName`: Company name used throughout templates
- `params.repoName`: GitHub repository name for Netlify CMS

**To Customize:**
1. Update `baseURL` to your domain
2. Change `title` to your site name
3. Update `CompanyName` to your company/brand name
4. Set `repoName` to your GitHub repository name

---

## Layout System

### Base Template (baseof.html)

**Location:** `layouts/_default/baseof.html`

The base template is the wrapper for all pages. It provides the HTML structure:

```html
<!DOCTYPE html>
<html lang="{{ .Site.LanguageCode }}">
  <head>
    {{ partial "head.html" . }}
  </head>
  <body>
    <div id="main-container">
      {{ partial "header.html" . }}

      <main class="main-content-area">
        {{ block "main" . }}{{ end }}
      </main>

      {{ partial "footer.html" . }}
    </div>

    {{ partial "foot.html" . }}
  </body>
</html>
```

**Key Features:**
- Uses Hugo's block system for content injection
- Includes partials for modular components
- Wraps all content in `#main-container`
- Separates head and foot scripts

### Template Types

#### 1. Homepage Template
**Location:** `layouts/index.html`

Used specifically for the homepage (`content/_index.md`).

```html
{{ define "main" }}
  <div class="row">
    <div class="col-12 col-lg-6">
        <h1>testing column1</h1>
    </div>
    <div class="col-12 col-lg-6">
        <h1>testing column2</h1>
    </div>
  </div>
{{ end }}
```

**Features:**
- Bootstrap grid layout
- Two-column responsive design
- Customizable content sections

#### 2. Single Page Template
**Location:** `layouts/_default/single.html`

Used for individual content pages.

```html
{{ define "main" }}
  {{ .Content }}
{{ end }}
```

**Usage:** Simply outputs the markdown content from content files.

#### 3. List Page Template
**Location:** `layouts/_default/list.html`

Used for list/section pages. Currently set up as a redirect.

```html
{{ define "main" }}
    <meta http-equiv="refresh" content="0; URL='/resources/state-resources/'">
    <p>Please wait while you are redirected...</p>
{{ end }}
```

#### 4. Terms Pages
**Location:** `layouts/terms/`

Special templates for legal pages with pre-built content:
- `accessibility-statement.html` - WCAG 2.0 AA compliant accessibility statement
- `privacy-policy.html` - Privacy policy template
- `terms-of-use.html` - Terms of use template

These templates include structured content with sections and use `{{ .Site.Params.CompanyName }}` for dynamic company name insertion.

---

## Partial Components

Partials are reusable template components located in `layouts/partials/`.

### head.html

**Location:** `layouts/partials/head.html`

Handles everything in the `<head>` section:

**Includes:**
- Meta charset and viewport
- Dynamic title based on page parameters
- SEO schema partial
- Favicon links (multiple sizes)
- Bootstrap CSS
- Custom CSS (shared.css + page-specific CSS)
- Google Fonts (Lato & Roboto)
- jQuery and InputMask libraries
- Font Awesome icons

**Page-Specific CSS:**
CSS files can be specified in front matter:
```yaml
css: ['home.css', 'custom.css']
```

These will be loaded from `static/src/css/`.

### header.html

**Location:** `layouts/partials/header.html`

Currently a placeholder with `<h1>Header</h1>`.

**To Customize:**
Replace with your navigation menu, logo, and header structure.

### footer.html

**Location:** `layouts/partials/footer.html`

Includes conditional CTA and footer content:

```html
<div>
  {{ if or (not (isset .Params "cta")) .Params.cta }}
      {{ partial "cta" . }}
  {{ end }}

  <footer>
    <h1>footer</h1>
  </footer>
</div>
```

**CTA Logic:**
- Shows CTA by default
- Hide CTA by setting `cta: false` in front matter
- Explicitly show with `cta: true`

### cta.html

**Location:** `layouts/partials/cta.html`

Call-to-action component. Currently a placeholder with `<h1>CTA</h1>`.

**To Customize:**
Add your call-to-action content (buttons, forms, etc.).

### foot.html

**Location:** `layouts/partials/foot.html`

Handles scripts before closing `</body>` tag:

**Includes:**
- Page-specific JavaScript (from front matter)
- Popper.js (for Bootstrap)
- Bootstrap JavaScript

**Page-Specific JS:**
Specify in front matter:
```yaml
js: ['menu.js', 'custom.js']
```

These will be loaded from `static/src/js/`.

### seo_schema.html

**Location:** `layouts/partials/seo_schema.html`

Comprehensive SEO meta tags:

**Includes:**
- Primary meta tags (title, description, summary, date)
- Open Graph / Facebook tags
- Twitter Card tags
- Robots meta tag (with environment-based indexing)

**Important:**
- Uses `PageTitle` if available, otherwise falls back to `Title`
- Robots meta prevents indexing on non-production environments
- Images pulled from front matter parameters

---

## Content Management

### Front Matter Structure

Content files use YAML front matter. Example from `content/_index.md`:

```yaml
---
title: 'Index Title Page'
description: 'Index Title Page'
image: /images/brand/share.png
priority: 1.0
cta: false
js: ['menu.js']
css: ['index.css']
---
```

**Available Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `title` | string | Page title |
| `PageTitle` | string | Override title (used in SEO) |
| `description` | string | Page description (SEO) |
| `image` | string | Social sharing image path |
| `seoimage` | string | SEO-specific image |
| `priority` | float | Sitemap priority (0.0-1.0) |
| `cta` | boolean | Show/hide CTA component |
| `js` | array | Page-specific JavaScript files |
| `css` | array | Page-specific CSS files |
| `canonical` | string | Canonical URL override |
| `noIndex` | boolean | Prevent search engine indexing |
| `private` | boolean | Exclude from sitemap |

### Creating Content Files

Content files go in the `content/` directory as `.md` (Markdown) files.

**Using Archetypes:**

```bash
hugo new posts/my-new-post.md
```

This uses `archetypes/default.md` as a template:

```markdown
+++
date = '2024-11-12'
draft = true
title = 'My New Post'
+++
```

**Note:** Draft pages won't appear in production unless you run `hugo --buildDrafts`.

---

## Asset Pipeline

### How Assets Work in Hugo

Hugo distinguishes between two types of files:

1. **Assets** (`assets/`) - Processed by Hugo (SCSS compilation, minification, etc.)
2. **Static** (`static/`) - Copied as-is to `public/`

### Assets Directory

**Location:** `assets/src/`

Contains source files that Hugo can process:
- SCSS files (compiled to CSS)
- JavaScript files (can be bundled/minified)

These files are NOT directly accessible to browsers. They must be processed by Hugo or referenced in templates.

### Static Directory

**Location:** `static/`

Contains files copied directly to `public/`:
- Compiled CSS
- JavaScript libraries (Bootstrap, jQuery)
- Images
- Fonts
- Any file that doesn't need processing

**URL Path:** Files in `static/` are served from the root. Example:
- `static/src/css/shared.css` → `https://yoursite.com/src/css/shared.css`

---

## Styling System

### SCSS Architecture

**Location:** `assets/src/scss/`

The template uses a modular SCSS structure:

```
scss/
├── shared/
│   ├── shared.scss       # Main import file
│   ├── _variables.scss   # Colors, fonts, breakpoints
│   ├── _typography.scss  # Font styles, headings
│   ├── _buttons.scss     # Button styles
│   ├── _links.scss       # Link styles
│   ├── _header.scss      # Header-specific styles
│   ├── _footer.scss      # Footer-specific styles
│   └── _common.scss      # Common/utility styles
└── home.scss             # Homepage-specific styles
```

### shared.scss

**Location:** `assets/src/scss/shared/shared.scss`

Main SCSS file that imports all partials:

```scss
@import 'variables';
@import 'typography';
@import 'buttons';
@import 'links';
@import 'header';
@import 'footer';
@import 'common';
```

**Usage:** This creates a compiled `shared.css` loaded on every page.

### Bootstrap Integration

Bootstrap 5 is included via static files:

**Location:** `static/src/css/bootstrap/`

**Files:**
- `bootstrap.min.css` - Full Bootstrap (minified)
- `bootstrap-grid.min.css` - Grid system only
- `bootstrap-utilities.min.css` - Utilities only
- RTL versions available

**Loaded in:** `layouts/partials/head.html`

```html
<link rel="stylesheet" href="{{ "src/css/bootstrap/bootstrap.min.css" | relURL }}">
```

### Adding New Styles

**Option 1: Modify SCSS**
1. Edit files in `assets/src/scss/shared/`
2. Changes require SCSS compilation
3. Output goes to `static/src/css/shared.css`

**Option 2: Add Page-Specific CSS**
1. Create CSS file in `static/src/css/`
2. Add to page front matter:
   ```yaml
   css: ['my-page.css']
   ```

---

## JavaScript

### Custom JavaScript

**Location:** `assets/src/js/menu.js`

Example custom JS file:

```javascript
console.log('menu.js loaded');
$('body').addClass('menu-js');
```

**Loading JavaScript:**

1. **Global JS** - Add to `layouts/partials/foot.html`
2. **Page-Specific JS** - Add to front matter:
   ```yaml
   js: ['menu.js', 'custom.js']
   ```

### JavaScript Libraries

**Location:** `static/src/js/`

Included libraries:
- **jQuery 3.7.1** (loaded from CDN)
- **jQuery InputMask 5.0.6** (loaded from CDN)
- **Bootstrap 5** (bundle includes Popper.js)
- **Font Awesome** (icons via Kit)

**Load Order (in foot.html):**
1. Page-specific JS (from front matter)
2. Popper.js
3. Bootstrap JS

---

## SEO & Metadata

### Sitemap Generation

**Location:** `layouts/sitemap.xml`

Custom sitemap template with advanced features:

**Features:**
- Sorts pages by priority (descending)
- Excludes private pages (`private: true`)
- Excludes low-priority pages (`priority < 0.1`)
- Includes lastmod dates
- Supports multi-language (hreflang)

**Priority Values:**
- `1.0` - Homepage (most important)
- `0.8` - Key pages
- `0.5` - Regular pages
- `0.3` - Low priority pages

**Example in front matter:**
```yaml
priority: 0.8
private: false
```

### Robots.txt

**Location:** `layouts/robots.txt`

```
User-agent: *
sitemap: {{ .Site.BaseURL }}sitemap.xml
Disallow: /tags
Disallow: /provenance
```

**Blocked Paths:**
- `/tags` - Tag pages
- `/provenance` - Provenance pages

**To Add More Disallows:**
```
Disallow: /admin
Disallow: /draft-content
```

### SEO Best Practices

The template includes:

1. **Structured Meta Tags** - Title, description, OG tags, Twitter cards
2. **Canonical URLs** - Prevents duplicate content issues
3. **Responsive Images** - OG images for social sharing
4. **Alt Text Support** - For accessibility and SEO
5. **Semantic HTML** - Proper heading hierarchy
6. **Environment-Based Indexing** - Prevents staging site indexing

---

## Netlify CMS

### Configuration

**Location:** `static/admin/config.yml`

Netlify CMS provides a user-friendly interface for content management without touching code.

**Backend Configuration:**
```yaml
backend:
  name: github
  repo: GROWDND/{{ .Site.Params.repoName }}
  branch: master
```

**Note:** Update `repoName` in `hugo.toml` to match your GitHub repo.

### CMS Collections

The template includes two collections:

#### 1. Blog Collection

**Location:** `content/resources/blog/`

**Fields:**
- Title, PageTitle, Description
- Slug, SEOImage, Image, Alt
- Tags, Priority, Popular
- Publish Date, Update Date
- Page Type, Type
- JavaScript, CSS
- Body (Markdown editor)

**Default Values:**
- `priority: '0.5'`
- `pagetype: 'article'`
- `type: 'resources/blog'`
- `js: ['menu.js', 'blog.js']`
- `css: ['site.css', 'blog.css']`

#### 2. Courses Collection

**Location:** `content/course/`

Extensive fields for course pages including:
- Course metadata (name, duration, state, category)
- Hero section fields
- "What You'll Learn" section
- Learning path sections
- Related posts (dropdown with 37+ predefined courses)
- CE credits information

**Default Values:**
- `priority: '0.8'`
- `type: 'courses/course'`
- `js: ['menu.js', 'course.js']`
- `css: ['site.css', 'inner.css']`

### Accessing the CMS

**URL:** `https://yoursite.com/admin/`

**Setup:**
1. Deploy site to Netlify
2. Enable Netlify Identity in Netlify dashboard
3. Enable Git Gateway
4. Invite users via Netlify Identity
5. Users log in at `/admin/`

**CMS Interface:**
The CMS is loaded via:
- `static/admin/index.html` (CMS app)
- `static/admin/config.yml` (CMS configuration)

**CMS Script:**
```html
<script src="https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js"></script>
```

---

## Deployment

### Netlify Configuration

**Location:** `netlify.toml`

```toml
[build]
  publish = "public"
  command = "hugo --config config.toml --gc --minify"

[context.production.environment]
  HUGO_VERSION = "0.147.4"
```

**Build Settings:**
- `publish: "public"` - Output directory
- `--gc` - Garbage collection for cleaner builds
- `--minify` - Minifies HTML/CSS/JS
- `HUGO_VERSION` - Ensures correct Hugo version

### Hugo Version Lock

**Location:** `.hugo-version`

```
0.147.4
```

This file ensures Netlify uses the correct Hugo version.

### Deployment Process

**Via Git:**
1. Push changes to GitHub
2. Netlify automatically builds and deploys
3. Preview deploys for pull requests

**Manual Deploy:**
```bash
hugo --gc --minify
# Upload public/ folder to Netlify
```

### Redirects

**Location:** `static/_redirects`

Netlify redirects file format:
```
# old-path new-path status-code
/old-page /new-page 301
```

**Example:**
```
/blog /resources/blog 301
/contact /support/contact-us 301
```

---

## Creating New Pages

### Method 1: Using Hugo CLI

```bash
# Create a new page
hugo new pages/about.md

# Create a new blog post
hugo new blog/my-post.md
```

### Method 2: Manual Creation

1. Create file in `content/` directory
2. Add front matter:

```markdown
---
title: 'About Us'
description: 'Learn about our company'
priority: 0.7
css: ['about.css']
js: ['about.js']
---

# About Us

Your content here...
```

### Method 3: Using Netlify CMS

1. Log in to `/admin/`
2. Select collection (Blog or Courses)
3. Click "New [Collection]"
4. Fill in fields
5. Save as draft or publish

### Creating Custom Templates

**For a specific page:**

1. Create layout in `layouts/` matching content path
   - Content: `content/products/index.md`
   - Layout: `layouts/products/index.html` or `layouts/products/list.html`

2. Create section template:
   - Content: `content/products/item1.md`
   - Layout: `layouts/products/single.html`

**Example template:**
```html
{{ define "main" }}
  <h1>{{ .Title }}</h1>
  <p>{{ .Description }}</p>
  {{ .Content }}
{{ end }}
```

---

## Customization Guide

### Updating Site Identity

**1. Update Configuration (hugo.toml):**
```toml
baseURL = 'https://yourdomain.com/'
title = 'Your Site Name'

[params]
CompanyName = 'Your Company Name'
repoName = 'your-github-repo'
```

**2. Update Favicons:**
Place in `static/`:
- `favicon.ico`
- `favicon-16x16.png`
- `favicon-32x32.png`
- `apple-touch-icon.png` (180x180)
- `safari-pinned-tab.svg`

**3. Update Fonts:**
Edit `layouts/partials/head.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=YourFont&display=swap" rel="stylesheet"/>
```

Update `assets/src/scss/shared/_variables.scss`:
```scss
$font-family-base: 'YourFont', sans-serif;
```

### Customizing Header

**Edit:** `layouts/partials/header.html`

**Example navigation:**
```html
<header>
  <div class="site-container-1340">
    <nav class="navbar navbar-expand-lg">
      <a class="navbar-brand" href="/">{{ .Site.Params.CompanyName }}</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
              data-bs-target="#navbarNav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav ms-auto">
          <li class="nav-item">
            <a class="nav-link" href="/about">About</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" href="/services">Services</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" href="/contact">Contact</a>
          </li>
        </ul>
      </div>
    </nav>
  </div>
</header>
```

### Customizing Footer

**Edit:** `layouts/partials/footer.html`

**Example:**
```html
<footer class="site-footer">
  <div class="site-container-1340">
    <div class="row">
      <div class="col-md-4">
        <h3>{{ .Site.Params.CompanyName }}</h3>
        <p>Your company description</p>
      </div>
      <div class="col-md-4">
        <h4>Quick Links</h4>
        <ul>
          <li><a href="/about">About</a></li>
          <li><a href="/services">Services</a></li>
          <li><a href="/contact">Contact</a></li>
        </ul>
      </div>
      <div class="col-md-4">
        <h4>Legal</h4>
        <ul>
          <li><a href="/privacy-policy">Privacy Policy</a></li>
          <li><a href="/terms-of-use">Terms of Use</a></li>
          <li><a href="/accessibility-statement">Accessibility</a></li>
        </ul>
      </div>
    </div>
    <div class="row">
      <div class="col-12 text-center">
        <p>&copy; {{ now.Year }} {{ .Site.Params.CompanyName }}. All rights reserved.</p>
      </div>
    </div>
  </div>
</footer>
```

### Adding New SCSS Partials

**1. Create file:**
`assets/src/scss/shared/_mynewpartial.scss`

**2. Import in shared.scss:**
```scss
@import 'variables';
@import 'typography';
@import 'buttons';
@import 'links';
@import 'header';
@import 'footer';
@import 'common';
@import 'mynewpartial';  // Add this line
```

**3. Compile SCSS** (if not auto-compiling):
```bash
hugo --gc
```

### Customizing CMS Collections

**Edit:** `static/admin/config.yml`

**Add a new collection:**
```yaml
- label: "Services"
  name: "services"
  folder: "content/services"
  create: true
  slug: "{{slug}}"
  fields:
    - {label: "Title", name: "title", widget: "string"}
    - {label: "Description", name: "description", widget: "text"}
    - {label: "Image", name: "image", widget: "image"}
    - {label: "Body", name: "body", widget: "markdown"}
```

### Environment Variables

You can use environment variables in `hugo.toml`:

```toml
[params]
  apiKey = "{{ getenv "API_KEY" }}"
  analyticsID = "{{ getenv "ANALYTICS_ID" }}"
```

Set in Netlify: Site settings > Build & deploy > Environment

---

## Development Workflow

### Local Development

**1. Start Hugo server:**
```bash
hugo server -D
```

**Options:**
- `-D` - Include draft content
- `--disableFastRender` - Full rebuilds (slower but more reliable)
- `--bind 0.0.0.0` - Access from network devices

**2. View site:**
Open browser to `http://localhost:1313/`

**3. Make changes:**
- Edit files
- Hugo auto-reloads browser

### Testing Before Deploy

**1. Build production version:**
```bash
hugo --gc --minify
```

**2. Serve production build:**
```bash
hugo server --renderToDisk
```

**3. Check for:**
- Broken links
- Missing images
- Console errors
- Mobile responsiveness
- Performance (Lighthouse)

### Git Workflow

**1. Create branch:**
```bash
git checkout -b feature/my-new-feature
```

**2. Make changes and commit:**
```bash
git add .
git commit -m "Add new feature"
```

**3. Push and create PR:**
```bash
git push origin feature/my-new-feature
```

**4. Netlify creates preview deploy**

**5. Merge to master → Auto-deploy to production**

---

## Troubleshooting

### Common Issues

**1. Hugo version mismatch**
- Ensure `.hugo-version` matches your local version
- Update `netlify.toml` if needed

**2. SCSS not compiling**
- Check Hugo Extended is installed: `hugo version`
- Verify import paths in `shared.scss`

**3. Page not appearing**
- Check `draft: false` in front matter
- Verify file location matches layout expectations

**4. CMS not loading**
- Check `repoName` in `hugo.toml`
- Verify Netlify Identity is enabled
- Check browser console for errors

**5. Styles not loading**
- Check file path in `static/`
- Verify front matter `css` array
- Clear browser cache

**6. JavaScript not working**
- Check browser console for errors
- Verify script load order in `foot.html`
- Ensure jQuery loads before dependent scripts

---

## Additional Resources

- [Hugo Documentation](https://gohugo.io/documentation/)
- [Bootstrap 5 Docs](https://getbootstrap.com/docs/5.0/)
- [Netlify CMS Docs](https://decapcms.org/docs/)
- [Netlify Deployment Docs](https://docs.netlify.com/)
- [WCAG 2.0 Guidelines](https://www.w3.org/TR/WCAG20/)

---

## Support

For issues or questions about this template:
1. Check the troubleshooting section above
2. Review Hugo documentation
3. Check your Netlify build logs
4. Review browser console for errors

---

**Last Updated:** November 2024
**Template Version:** 1.0
**Hugo Version:** 0.147.4
