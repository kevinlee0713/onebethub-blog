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
	if ( function_exists( 'pll_the_languages' ) ) {
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
		return;
	}

	// Fallback switcher while Polylang isn't installed yet — reuses the
	// pipeline's fixed "{ko-slug}-en" convention (onebethub_sibling_post_id())
	// so this is a real, working KO/EN toggle rather than just a dead spot
	// where Polylang's widget would otherwise be. On archives/home it flips
	// a plain ?lang=en query var, which onebethub_apply_lang_filter_to_main_query()
	// and the onebethub_lang arg on front-page.php's custom queries both read.
	$lang = onebethub_current_view_lang();
	if ( is_singular( 'post' ) ) {
		$sibling_id = onebethub_sibling_post_id( get_the_ID() );
		$ko_url     = ( 'ko' === $lang ) ? get_permalink() : ( $sibling_id ? get_permalink( $sibling_id ) : home_url( '/' ) );
		$en_url     = ( 'en' === $lang ) ? get_permalink() : ( $sibling_id ? get_permalink( $sibling_id ) : home_url( '/?lang=en' ) );
	} else {
		$base   = remove_query_arg( 'lang' );
		$ko_url = $base;
		$en_url = add_query_arg( 'lang', 'en', $base );
	}
	?>
	<div class="flex items-center border border-slate-200 rounded overflow-hidden text-xs font-bold font-mono" data-context="<?php echo esc_attr( $context ); ?>">
		<a href="<?php echo esc_url( $ko_url ); ?>" class="px-2.5 py-1.5 transition <?php echo ( 'ko' === $lang ) ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'; ?>">KO</a>
		<a href="<?php echo esc_url( $en_url ); ?>" class="px-2.5 py-1.5 transition <?php echo ( 'en' === $lang ) ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'; ?>">EN</a>
	</div>
	<?php
}

/**
 * Current "view language" — Polylang's real value once installed; until
 * then, derived from the singular post's own slug, or a plain ?lang=en
 * query var for archive/home/search views (see onebethub_language_switcher()
 * and onebethub_apply_lang_filter_to_main_query()).
 */
function onebethub_current_view_lang() {
	if ( function_exists( 'pll_current_language' ) ) {
		return pll_current_language();
	}
	if ( is_singular( 'post' ) ) {
		return onebethub_post_lang_from_slug( get_post_field( 'post_name', get_the_ID() ) );
	}
	return ( isset( $_GET['lang'] ) && 'en' === $_GET['lang'] ) ? 'en' : 'ko'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
}

/**
 * posts_where filter keyed off a custom 'onebethub_lang' query var, so both
 * the main query (via pre_get_posts below) and front-page.php's standalone
 * WP_Query/get_posts() calls can opt in with the same mechanism. Without
 * this, KO and EN posts (which are just ordinary same-category WP posts
 * until Polylang is installed) interleave freely in every listing — visibly
 * broken on a page that's supposed to default to one language at a time.
 */
function onebethub_lang_where( $where, $query ) {
	$lang = $query->get( 'onebethub_lang' );
	if ( ! $lang ) {
		return $where;
	}
	global $wpdb;
	$where .= ( 'en' === $lang )
		? " AND {$wpdb->posts}.post_name LIKE '%-en'"
		: " AND {$wpdb->posts}.post_name NOT LIKE '%-en'";
	return $where;
}
add_filter( 'posts_where', 'onebethub_lang_where', 10, 2 );

/**
 * Applies the same language filter to the real main query (category
 * archives, search, and the home blog fallback) so front-page.php isn't the
 * only template that needs to remember to pass 'onebethub_lang' explicitly.
 */
function onebethub_apply_lang_filter_to_main_query( $query ) {
	if ( is_admin() || ! $query->is_main_query() || function_exists( 'pll_current_language' ) ) {
		return;
	}
	if ( $query->is_category() || $query->is_search() || $query->is_home() ) {
		$query->set( 'onebethub_lang', onebethub_current_view_lang() );
	}
}
add_action( 'pre_get_posts', 'onebethub_apply_lang_filter_to_main_query' );

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

/* -----------------------------------------------------------------------
 * Static UI-text EN translations (2026-09-19).
 *
 * Post CONTENT is already language-separated (onebethub_lang_where() above),
 * but every static theme string (footer disclaimer, "카테고리별 최신 리포트",
 * "리포트 열람하기", etc.) is still hardcoded Korean, so an EN-view visitor
 * got a Korean-chrome page around English articles. Real i18n (.po/.mo +
 * switch_to_locale()) is overkill for a fixed, known set of theme strings —
 * instead this intercepts the theme's own existing __()/_e()/esc_html_e()
 * calls (already correctly using the 'onebethub' text domain throughout)
 * via the `gettext`/`ngettext` filters and swaps in a translation from the
 * dictionary below whenever onebethub_current_view_lang() is 'en'. Goes
 * silent instantly if Polylang (pll__) is active — real .mo-based
 * translation should take over at that point instead.
 * ------------------------------------------------------------------- */
function onebethub_ko_en_dictionary() {
	return array(
		'다음' => 'Next',
		'연관된 리포트가 아직 없습니다.' => 'No related reports yet.',
		'이전' => 'Previous',
		'읽는 시간 %d분' => '%d min read',
		'읽는 시간 약 %d분' => 'About %d min read',
		'페이지:' => 'Page:',
		'벤더 SLA, API 규격, GGR 수수료 비교, 라이선스 검색...' => 'Search vendor SLAs, API specs, GGR fees, licensing...',
		'검색' => 'Search',
		'주요 카테고리' => 'Primary Categories',
		'페이지네이션' => 'Pagination',
		'1:1 심층 실사 요청하기' => 'Request a 1:1 Deep-Dive Audit',
		'B2B 독립 벤더 실사 문의' => 'B2B Independent Vendor Due-Diligence Inquiry',
		'Executive Briefing 신청' => 'Subscribe to Executive Briefing',
		'건' => 'reports',
		'검색 결과' => 'Search Results',
		'검토 중인 벤더 견적서를 리서치팀이 교차 검증해 드립니다.' => 'Our research team cross-verifies the vendor quotes you\'re reviewing.',
		'게시된 콘텐츠가 없습니다.' => 'No content has been published yet.',
		'구독 신청' => 'Subscribe',
		'글로벌 플랫폼 코어, API 공급사, 결제 게이트웨이 및 관할 규제 실사' => 'Global platform cores, API providers, payment gateways, and jurisdictional compliance audits',
		'기업용 브리핑 구독' => 'Subscribe to Corporate Briefing',
		'는 게이밍 플랫폼 공급업체로부터 광고비를 받고 실사 순위를 조작하지 않습니다. 모든 벤더 평가와 비용 모델은 공개된 계약 구조와 시장 데이터에 기반한 객관적 분석만을 게재합니다.'
			=> ' does not accept advertising fees from gaming platform vendors or manipulate audit rankings. Every vendor evaluation and cost model published here is based solely on objective analysis of public contract structures and market data.',
		'는 글로벌 온라인 카지노, 스포츠북 배당 엔진 및 화이트라벨 소프트웨어 공급망을 감사·조사하는 독립 B2B 인텔리전스 미디어입니다. 특정 벤더를 홍보하거나 대행하지 않습니다.'
			=> ' is an independent B2B intelligence media outlet that audits and investigates the global online casino, sportsbook odds-engine, and white-label software supply chain. It does not promote or represent any specific vendor.',
		'는 벤더 스폰서십 없이 공개 데이터에 기반해 리포트를 작성합니다.' => ' publishes reports based on public data, without vendor sponsorship.',
		'는 어떠한 iGaming 플랫폼 벤더로부터도 스폰서십을 받지 않습니다.' => ' accepts no sponsorship from any iGaming platform vendor.',
		'독립 심사 원칙' => 'Independent Review Principles',
		'등록 리포트' => 'Registered Reports',
		'리포트 보기 →' => 'View Report →',
		'리포트 열람하기' => 'Read the Report',
		'매주, 심층 리포트를 수신하세요' => 'Get in-depth reports every week',
		'모든 벤더 성능 지표와 리뷰는 솔루션 공급사의 스폰서십을 엄격히 배제하고 공개 데이터와 계약 구조 분석에만 기반합니다.'
			=> 'All vendor performance metrics and reviews strictly exclude solution-provider sponsorship and are based solely on public data and contract-structure analysis.',
		'발행일:' => 'Published:',
		'벤더 실사 제보, SLA 분쟁 데이터 제공 및 기업 구독 문의:' => 'Vendor due-diligence tips, SLA dispute data, and corporate subscription inquiries:',
		'벤더 평가 방법론' => 'Vendor Evaluation Methodology',
		'본 매체에 게재된 인텔리전스는 공익적 정보 제공 및 기술적 소프트웨어 아키텍처 비교를 목적으로 하며, 특정 관할권에서 불법으로 규정된 도박 영업을 조장하거나 유인하지 않습니다. 모든 이용자는 소재 지역 법률을 준수할 책임이 있습니다.'
			=> 'The intelligence published on this outlet is intended for public-interest information and technical software-architecture comparison, and does not promote or induce gambling operations deemed illegal in any given jurisdiction. All users are responsible for complying with the laws of their own location.',
		'본문으로 건너뛰기' => 'Skip to content',
		'실사 리포트' => 'Read the Audit',
		'아직 게시된 리포트가 없습니다.' => 'No reports have been published yet.',
		'연관 인텔리전스 리포트' => 'Related Intelligence Reports',
		'연관 카테고리 바로가기' => 'Related Categories',
		'이 카테고리에는 아직 게시된 리포트가 없습니다.' => 'No reports have been published in this category yet.',
		'이 카테고리의 신규 리포트 발행 시 이메일로 안내받으세요.' => 'Get notified by email when a new report is published in this category.',
		'익명 제보 창구' => 'Anonymous Tip Line',
		'전체' => 'All',
		'정정 및 반론 보도 정책' => 'Corrections & Right-of-Reply Policy',
		'정확한 관할 명칭 또는 벤더/솔루션 유형을 확인해 주세요.' => 'Please check the exact jurisdiction name or vendor/solution type.',
		'최근 업데이트' => 'Last Updated',
		'최신 공급망 인텔리전스 피드' => 'Latest Supply-Chain Intelligence Feed',
		'카테고리 바로가기' => 'Jump to Category',
		'카테고리 인덱스' => 'Category Index',
		'카테고리' => 'Category',
		'카테고리별 최신 리포트' => 'Latest by Category',
		'편집권 독립 선언서' => 'Editorial Independence Declaration',
		'편집권 독립 헌장' => 'Editorial Independence Charter',
		'플랫폼 아키텍트를 위한 공급망 단가 변동 및 인프라 감사 브리핑을 이메일로 전송합니다.' => 'We email platform architects supply-chain pricing shifts and infrastructure audit briefings.',
		'홈으로 돌아가기' => 'Back to Home',
		'총 %d건' => '%d results found',
	);
}

function onebethub_translate_ui_text( $translated, $original, $domain ) {
	if ( 'onebethub' !== $domain || function_exists( 'pll__' ) ) {
		return $translated;
	}
	if ( 'en' !== onebethub_current_view_lang() ) {
		return $translated;
	}
	$dict = onebethub_ko_en_dictionary();
	return isset( $dict[ $original ] ) ? $dict[ $original ] : $translated;
}
add_filter( 'gettext', 'onebethub_translate_ui_text', 10, 3 );

function onebethub_translate_ui_text_plural( $translated, $single, $plural, $number, $domain ) {
	// Both _n() calls in this theme use identical singular/plural Korean text
	// (Korean doesn't inflect for count), so look up whichever form gettext
	// picked using the same dictionary as onebethub_translate_ui_text().
	return onebethub_translate_ui_text( $translated, ( 1 === (int) $number ) ? $single : $plural, $domain );
}
add_filter( 'ngettext', 'onebethub_translate_ui_text_plural', 10, 5 );

function onebethub_translate_ui_text_with_context( $translated, $original, $context, $domain ) {
	return onebethub_translate_ui_text( $translated, $original, $domain );
}
add_filter( 'gettext_with_context', 'onebethub_translate_ui_text_with_context', 10, 4 );
