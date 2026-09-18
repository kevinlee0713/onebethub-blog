<?php
/**
 * OneBetHub theme bootstrap.
 *
 * Content model this theme is built against (see scripts/generate-post.mjs
 * and scripts/keyword-map.json in the repo root):
 *   - Posts are created with native WP categories, one per pipeline
 *     "cluster": 임대 / 분양 / 제작 / 가격 / 토토개발.
 *   - SEO <head> tags (title, description, canonical, schema) are meant to
 *     be owned by Rank Math (rank_math_* postmeta) once it's installed.
 *     Until then, this theme fills the gap with guarded fallbacks
 *     (onebethub_meta_description_fallback, onebethub_hreflang_fallback,
 *     onebethub_html_lang_attribute) that go silent the instant Rank Math /
 *     Polylang are actually active — see the "SEO <head> fallbacks" section
 *     below. <title> itself uses add_theme_support('title-tag') so wp_head()
 *     prints exactly one, with or without Rank Math.
 *   - Polylang may not be installed yet on a fresh deploy. Every Polylang
 *     call in this theme is guarded with function_exists() so the theme
 *     works identically with or without the plugin.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ONEBETHUB_VERSION', '1.0.0' );

/* -----------------------------------------------------------------------
 * Theme setup
 * ------------------------------------------------------------------- */

function onebethub_setup() {
	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support(
		'html5',
		array( 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' )
	);
	add_theme_support( 'automatic-feed-links' );
	add_theme_support( 'customize-selective-refresh-widgets' );

	register_nav_menus(
		array(
			'primary' => __( 'Primary Navigation (5 Category Taxonomy Bar)', 'onebethub' ),
			'footer'  => __( 'Footer Links', 'onebethub' ),
		)
	);
}
add_action( 'after_setup_theme', 'onebethub_setup' );

/* -----------------------------------------------------------------------
 * The 5 fixed taxonomy categories.
 *
 * These map 1:1 to the "cluster" field in scripts/keyword-map.json and to
 * the categoryId the pipeline resolves via getOrCreateTaxonomy('categories', cluster)
 * in scripts/generate-post.mjs (wp_insert_term with the raw Korean name —
 * WP keeps unicode slugs, so the slug ends up being the Korean string
 * itself, URL-encoded). We create them here too (idempotent, matched by
 * name) so a fresh WP install already has the right taxonomy in the right
 * order before the very first post is ever published.
 * ------------------------------------------------------------------- */

function onebethub_default_categories() {
	return array(
		'임대'    => array(
			'order'      => 1,
			'en'         => 'Platform Lease',
			'desc_ko'    => '턴키·화이트라벨 플랫폼 임대 계약, SLA, 서버 인프라 호스팅 비용 실사.',
		),
		'분양'    => array(
			'order'      => 2,
			'en'         => 'Platform Distribution',
			'desc_ko'    => '마스터 디스트리뷰터·에이전시 분양 구조, 정산 및 커미션 아키텍처.',
		),
		'제작'    => array(
			'order'      => 3,
			'en'         => 'Custom Development',
			'desc_ko'    => '자체 소스코드 개발, API 연동, 결제/월렛 아키텍처 및 엔지니어링 벤치마크.',
		),
		'가격'    => array(
			'order'      => 4,
			'en'         => 'Pricing & CapEx',
			'desc_ko'    => '월정액·수익쉐어·초기 CapEx 비교 및 총소유비용(TCO) 모델.',
		),
		'토토개발'  => array(
			'order'      => 5,
			'en'         => 'Sportsbook Engineering',
			'desc_ko'    => '스포츠 배당 오즈 엔진, 실시간 피드 파이프라인, 인플레이 리스크 관리.',
		),
	);
}

function onebethub_ensure_default_categories() {
	foreach ( onebethub_default_categories() as $name => $meta ) {
		if ( ! term_exists( $name, 'category' ) ) {
			wp_insert_term(
				$name,
				'category',
				array( 'description' => $meta['desc_ko'] )
			);
		}
	}
}
add_action( 'after_switch_theme', 'onebethub_ensure_default_categories' );
// Also self-heal on normal admin loads in case the theme was uploaded /
// activated directly on the server (e.g. via wp-cli) without ever firing
// after_switch_theme in a browser context.
add_action( 'admin_init', 'onebethub_ensure_default_categories' );

/**
 * Category slug/name -> Tailwind accent color classes.
 *
 * Per the design spec: these hex values are literally Tailwind's default
 * palette values (0284C7=sky-600, 0D9488=teal-600, 6366F1=indigo-500,
 * B45309=amber-700, 334155=slate-700), so we can use plain Tailwind
 * utility classes instead of inline styles and still hit the exact spec
 * colors.
 *   임대      = Cobalt  (sky)    on #F0F9FF (sky-50)
 *   분양      = Teal    (teal)   on #F0FDFA (teal-50)
 *   제작      = Indigo  (indigo) on #EEF2FF (indigo-50)
 *   가격      = Amber   (amber)  on #FFFBEB (amber-50)
 *   토토개발   = Slate   (slate)  on #F1F5F9 (slate-100)
 *
 * @param string $name_or_slug Category name or slug.
 * @return array{bg:string,bg_soft:string,text:string,border:string,dot:string,solid:string,hex:string,gradient_from:string}
 */
function onebethub_category_colors( $name_or_slug ) {
	$map = array(
		'임대'     => array(
			'bg'      => 'bg-sky-50',
			'text'    => 'text-sky-700',
			'border'  => 'border-sky-200',
			'dot'     => 'bg-sky-600',
			'solid'   => 'bg-sky-600',
			'hex'     => '#0284C7',
			'from'    => 'from-sky-50',
		),
		'분양'     => array(
			'bg'      => 'bg-teal-50',
			'text'    => 'text-teal-700',
			'border'  => 'border-teal-200',
			'dot'     => 'bg-teal-600',
			'solid'   => 'bg-teal-600',
			'hex'     => '#0D9488',
			'from'    => 'from-teal-50',
		),
		'제작'     => array(
			'bg'      => 'bg-indigo-50',
			'text'    => 'text-indigo-600',
			'border'  => 'border-indigo-200',
			'dot'     => 'bg-indigo-500',
			'solid'   => 'bg-indigo-500',
			'hex'     => '#6366F1',
			'from'    => 'from-indigo-50',
		),
		'가격'     => array(
			'bg'      => 'bg-amber-50',
			'text'    => 'text-amber-700',
			'border'  => 'border-amber-200',
			'dot'     => 'bg-amber-700',
			'solid'   => 'bg-amber-700',
			'hex'     => '#B45309',
			'from'    => 'from-amber-50',
		),
		'토토개발'  => array(
			'bg'      => 'bg-slate-100',
			'text'    => 'text-slate-700',
			'border'  => 'border-slate-300',
			'dot'     => 'bg-slate-700',
			'solid'   => 'bg-slate-700',
			'hex'     => '#334155',
			'from'    => 'from-slate-100',
		),
	);

	if ( isset( $map[ $name_or_slug ] ) ) {
		return $map[ $name_or_slug ];
	}

	// Fall back: try matching by decoded slug (WP unicode slugs come back
	// url-encoded from get_category_link()/->slug in some contexts).
	$decoded = urldecode( (string) $name_or_slug );
	if ( isset( $map[ $decoded ] ) ) {
		return $map[ $decoded ];
	}

	// Unknown / uncategorized fallback: neutral slate.
	return array(
		'bg'     => 'bg-slate-100',
		'text'   => 'text-slate-600',
		'border' => 'border-slate-200',
		'dot'    => 'bg-slate-500',
		'solid'  => 'bg-slate-500',
		'hex'    => '#64748B',
		'from'   => 'from-slate-100',
	);
}

/**
 * English label for a given cluster name, used next to the Korean label
 * in nav/badges (mirrors the Stitch mockups' "임대 (Platform Lease)" style).
 */
function onebethub_category_en_label( $name_or_slug ) {
	$defaults = onebethub_default_categories();
	if ( isset( $defaults[ $name_or_slug ] ) ) {
		return $defaults[ $name_or_slug ]['en'];
	}
	$decoded = urldecode( (string) $name_or_slug );
	return isset( $defaults[ $decoded ] ) ? $defaults[ $decoded ]['en'] : '';
}

function onebethub_category_order_index( $name_or_slug ) {
	$defaults = onebethub_default_categories();
	if ( isset( $defaults[ $name_or_slug ] ) ) {
		return $defaults[ $name_or_slug ]['order'];
	}
	$decoded = urldecode( (string) $name_or_slug );
	return isset( $defaults[ $decoded ] ) ? $defaults[ $decoded ]['order'] : 99;
}

/**
 * Render a small category badge (used on cards / feed items / article header).
 */
function onebethub_category_badge( $category, $size = 'sm' ) {
	if ( ! $category ) {
		return '';
	}
	$colors  = onebethub_category_colors( $category->name );
	$padding = ( 'lg' === $size ) ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';
	return sprintf(
		'<a href="%1$s" class="inline-flex items-center gap-1.5 %2$s font-bold uppercase tracking-wide rounded-xs border %3$s %4$s %5$s hover:opacity-80 transition">' .
		'<span class="w-1.5 h-1.5 rounded-full %6$s"></span>%7$s</a>',
		esc_url( get_category_link( $category ) ),
		esc_attr( $padding ),
		esc_attr( $colors['bg'] ),
		esc_attr( $colors['text'] ),
		esc_attr( $colors['border'] ),
		esc_attr( $colors['dot'] ),
		esc_html( $category->name )
	);
}

/* -----------------------------------------------------------------------
 * Reading time — simple word-count / 200wpm heuristic. Korean text is
 * character-dense rather than space-delimited, so we blend a character
 * count (Korean reads roughly ~500-550 chars/min for this kind of trade
 * copy) with a plain word count for any Latin-script content, then take
 * whichever estimate is larger so mixed KO/EN posts aren't under-counted.
 * ------------------------------------------------------------------- */
function onebethub_estimated_read_minutes( $post_id = null ) {
	$post_id = $post_id ?: get_the_ID();
	$content = get_post_field( 'post_content', $post_id );
	$text    = wp_strip_all_tags( strip_shortcodes( $content ) );

	$word_count = str_word_count( $text );
	$char_count = function_exists( 'mb_strlen' ) ? mb_strlen( $text, 'UTF-8' ) : strlen( $text );

	$by_words = max( 1, (int) ceil( $word_count / 200 ) );
	$by_chars = max( 1, (int) ceil( $char_count / 500 ) );

	return max( $by_words, $by_chars );
}

/* -----------------------------------------------------------------------
 * Assets: Google Fonts, Tailwind CDN + shared config, base stylesheet.
 * ------------------------------------------------------------------- */

function onebethub_enqueue_assets() {
	wp_enqueue_style( 'onebethub-style', get_stylesheet_uri(), array(), ONEBETHUB_VERSION );

	wp_enqueue_style(
		'onebethub-google-fonts',
		'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400&display=swap',
		array(),
		null
	);

	// Tailwind CDN build (per project convention: no build step / no
	// webpack — a pragmatic tradeoff for a fast-shipped internal B2B site).
	wp_enqueue_script(
		'onebethub-tailwind-cdn',
		'https://cdn.tailwindcss.com?plugins=forms,container-queries',
		array(),
		null,
		false // must load in <head>, before any inline config/usage
	);

	// Config merged from the Stitch mockups. The three desktop mockups
	// each shipped a slightly different tailwind.config (different brand.*
	// key names / extra mock-only tokens); this is the single reconciled
	// config the theme actually uses everywhere, built around the values
	// stated in the design brief (primary/secondary/tertiary + Newsreader
	// + Inter) rather than any one mockup's exact block.
	$config_js = <<<JS
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: '#0F172A',
          secondary: '#0D9488',
          tertiary: '#0284C7',
          bg: '#F8FAFC',
        },
        slate: {
          850: '#151f33',
          950: '#090d16',
        },
      },
      maxWidth: {
        content: '1360px',
      },
      borderRadius: {
        xs: '4px',
      },
    }
  }
}
JS;
	wp_add_inline_script( 'onebethub-tailwind-cdn', $config_js, 'after' );
}
add_action( 'wp_enqueue_scripts', 'onebethub_enqueue_assets' );

/* -----------------------------------------------------------------------
 * Nav fallback: if no menu is assigned to the 'primary' location, build
 * the 5-category taxonomy bar straight from the categories themselves so
 * the site is never left without navigation.
 * ------------------------------------------------------------------- */
function onebethub_primary_categories() {
	$cats = get_categories(
		array(
			'hide_empty' => false,
			'exclude'    => array( get_option( 'default_category' ) ),
		)
	);
	usort(
		$cats,
		function ( $a, $b ) {
			return onebethub_category_order_index( $a->name ) <=> onebethub_category_order_index( $b->name );
		}
	);
	return $cats;
}

/* -----------------------------------------------------------------------
 * Polylang integration — every call guarded with function_exists() since
 * Polylang is not installed on the live site yet.
 * ------------------------------------------------------------------- */
function onebethub_language_switcher( $context = 'desktop' ) {
	if ( ! function_exists( 'pll_the_languages' ) ) {
		return;
	}
	$args = array(
		'dropdown'                => 0,
		'show_flags'              => 0,
		'show_names'              => 1,
		'display_names_as'        => 'slug',
		'hide_if_empty'           => 0,
		'force_home'              => 0,
	);
	echo '<div class="pll-switcher flex items-center border border-slate-200 rounded p-0.5 bg-slate-50 text-xs font-semibold" data-context="' . esc_attr( $context ) . '">';
	pll_the_languages( $args );
	echo '</div>';
}

/* -----------------------------------------------------------------------
 * Misc theme hygiene.
 * ------------------------------------------------------------------- */

/**
 * search.php renders category filter chips as plain links to
 * ?s=...&cat=<id> (no client-side JS filtering, per spec). WP's default
 * search query doesn't apply the 'cat' param on its own, so wire it in on
 * the main search query only.
 */
function onebethub_search_category_filter( $query ) {
	if ( is_admin() || ! $query->is_main_query() ) {
		return;
	}
	if ( $query->is_search() && ! empty( $_GET['cat'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$query->set( 'cat', absint( $_GET['cat'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	}
}
add_action( 'pre_get_posts', 'onebethub_search_category_filter' );

// Rank Math already owns <title>/meta description/OG/schema output — make
// sure we don't accidentally double up by leaving WP's default meta
// generator tag off, but otherwise do not touch <head> SEO tags at all.
remove_action( 'wp_head', 'wp_generator' );

/* -----------------------------------------------------------------------
 * SEO <head> fallbacks for the gap between "pipeline saved the SEO data as
 * postmeta" and "a plugin is actually installed to render it." Rank Math
 * isn't installed on the live site yet (2026-09-18), so rank_math_description
 * postmeta was being saved by generate-post.mjs but never reaching <head> —
 * every published page was missing <meta name="description"> entirely.
 * Every function below is a no-op the instant Rank Math (or Polylang, for
 * the language ones) is actually active, so nothing needs to change here
 * once those plugins are installed — these are pure gap-fillers.
 * ------------------------------------------------------------------- */

/**
 * <meta name="description"> fallback, sourced from the rank_math_description
 * postmeta the pipeline already saves (falls back to the post excerpt if
 * that's somehow empty). Skips entirely if Rank Math is active so we never
 * emit a duplicate/competing tag once the plugin takes over.
 */
function onebethub_meta_description_fallback() {
	if ( defined( 'RANK_MATH_VERSION' ) ) {
		return;
	}
	if ( ! is_singular( 'post' ) ) {
		return;
	}
	$post_id     = get_the_ID();
	$description = get_post_meta( $post_id, 'rank_math_description', true );
	if ( ! $description ) {
		$description = wp_strip_all_tags( get_the_excerpt( $post_id ) );
	}
	if ( $description ) {
		printf( '<meta name="description" content="%s" />' . "\n", esc_attr( $description ) );
	}
}
add_action( 'wp_head', 'onebethub_meta_description_fallback', 1 );

/**
 * KO/EN sibling posts follow a fixed naming convention set by
 * generate-post.mjs: the EN post's slug is always "{ko-slug}-en" (see
 * `enSlug = ${page.slug}-en` in createWordPressPost's caller). We use that
 * convention — not Polylang — to find the sibling post and to tell KO from
 * EN, so language/hreflang are correct even before Polylang is installed.
 */
function onebethub_post_lang_from_slug( $slug ) {
	return ( is_string( $slug ) && preg_match( '/-en$/', $slug ) ) ? 'en' : 'ko';
}

function onebethub_sibling_post_id( $post_id ) {
	$post = get_post( $post_id );
	if ( ! $post ) {
		return null;
	}
	$sibling_slug = ( 'en' === onebethub_post_lang_from_slug( $post->post_name ) )
		? preg_replace( '/-en$/', '', $post->post_name )
		: $post->post_name . '-en';
	$sibling = get_page_by_path( $sibling_slug, OBJECT, 'post' );
	return ( $sibling && 'publish' === $sibling->post_status ) ? $sibling->ID : null;
}

/**
 * <html lang="..."> — language_attributes() only ever reflects the single
 * site-wide WP locale, so on a bilingual site without Polylang it is wrong
 * for whichever language isn't the site default (we found both the KO and
 * EN post rendering lang="en-US" — the site locale is English). For a
 * singular post we override using the slug convention above; everything
 * else (home, archives) still uses the real site locale via
 * language_attributes(). Once Polylang is active this defers to it
 * entirely, since Polylang patches language_attributes() itself.
 */
function onebethub_html_lang_attribute() {
	if ( function_exists( 'pll_current_language' ) || ! is_singular( 'post' ) ) {
		language_attributes();
		return;
	}
	$lang = onebethub_post_lang_from_slug( get_post_field( 'post_name', get_the_ID() ) );
	echo 'lang="' . ( 'en' === $lang ? 'en-US' : 'ko-KR' ) . '"'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
}

/**
 * hreflang tags, derived the same convention-based way. Skips entirely once
 * Polylang is active (it manages hreflang on its own).
 */
function onebethub_hreflang_fallback() {
	if ( function_exists( 'pll_current_language' ) || ! is_singular( 'post' ) ) {
		return;
	}
	$post_id    = get_the_ID();
	$lang       = onebethub_post_lang_from_slug( get_post_field( 'post_name', $post_id ) );
	$sibling_id = onebethub_sibling_post_id( $post_id );

	$ko_url = ( 'ko' === $lang ) ? get_permalink( $post_id ) : ( $sibling_id ? get_permalink( $sibling_id ) : null );
	$en_url = ( 'en' === $lang ) ? get_permalink( $post_id ) : ( $sibling_id ? get_permalink( $sibling_id ) : null );

	if ( $ko_url ) {
		printf( '<link rel="alternate" hreflang="ko" href="%s" />' . "\n", esc_url( $ko_url ) );
		printf( '<link rel="alternate" hreflang="x-default" href="%s" />' . "\n", esc_url( $ko_url ) );
	}
	if ( $en_url ) {
		printf( '<link rel="alternate" hreflang="en" href="%s" />' . "\n", esc_url( $en_url ) );
	}
}
add_action( 'wp_head', 'onebethub_hreflang_fallback', 1 );

function onebethub_body_classes( $classes ) {
	$classes[] = 'bg-slate-50';
	$classes[] = 'text-slate-900';
	$classes[] = 'antialiased';
	return $classes;
}
add_filter( 'body_class', 'onebethub_body_classes' );

/**
 * Excerpt helper used on cards when the post has no manual excerpt.
 */
function onebethub_card_excerpt( $post_id, $length = 140 ) {
	$excerpt = get_the_excerpt( $post_id );
	$excerpt = wp_strip_all_tags( $excerpt );
	if ( function_exists( 'mb_strlen' ) && mb_strlen( $excerpt, 'UTF-8' ) > $length ) {
		$excerpt = mb_substr( $excerpt, 0, $length, 'UTF-8' ) . '…';
	}
	return $excerpt;
}

/* -----------------------------------------------------------------------
 * Custom walker for the primary nav menu (used only when an editor has
 * assigned an actual menu to the 'primary' location; otherwise header.php
 * falls back to rendering the 5 categories directly). Renders each
 * top-level item in the same "01 임대 (Lease)" pill style as the category
 * fallback, using the category accent color when the menu item points at
 * a category archive.
 * ------------------------------------------------------------------- */
class OneBetHub_Nav_Walker extends Walker_Nav_Menu {
	public function start_el( &$output, $item, $depth = 0, $args = null, $id = 0 ) {
		$index     = $item->menu_order ?? ( $id + 1 );
		$is_active = in_array( 'current-menu-item', $item->classes, true );
		$classes   = $is_active
			? 'border-sky-600 text-sky-900 bg-sky-50/40 font-semibold'
			: 'border-transparent text-slate-700 hover:text-slate-900 hover:border-slate-300';

		$output .= sprintf(
			'<a href="%1$s" class="flex items-center px-4 md:px-5 py-3 border-b-2 shrink-0 transition group %2$s"><span class="text-xs font-mono mr-2 font-bold %3$s">%4$s</span><span>%5$s</span></a>',
			esc_url( $item->url ),
			esc_attr( $classes ),
			$is_active ? 'text-sky-600' : 'text-slate-400 group-hover:text-slate-600',
			esc_html( str_pad( (string) $index, 2, '0', STR_PAD_LEFT ) ),
			esc_html( $item->title )
		);
	}
}
