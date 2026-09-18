<?php
/**
 * Shared header: flash ticker, brand/search/utility bar, 5-category nav.
 * Responsive via Tailwind classes rather than two separate markup trees —
 * desktop layout ports stitch-export/home-desktop.html + category-lease-
 * desktop.html; mobile chrome ports the fixed logo-row + horizontal-scroll
 * category-row pattern shared by category-lease-mobile.html / search-mobile.html.
 */
$onebethub_categories = onebethub_primary_categories();
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<link rel="profile" href="https://gmpg.org/xfn/11" />
<?php wp_head(); ?>
</head>
<body <?php body_class( 'font-sans min-h-screen flex flex-col selection:bg-sky-100 selection:text-sky-900' ); ?>>
<?php wp_body_open(); ?>

<a class="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:text-slate-900 focus:px-4 focus:py-2" href="#main-content"><?php esc_html_e( '본문으로 건너뛰기', 'onebethub' ); ?></a>

<!-- Flash ticker: desktop only -->
<aside class="ticker-gradient text-slate-300 text-xs py-2 px-4 md:px-8 border-b border-slate-800 hidden md:block" aria-hidden="true">
	<div class="max-w-content mx-auto flex items-center justify-between">
		<div class="flex items-center space-x-3 overflow-hidden text-ellipsis whitespace-nowrap">
			<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-rose-950/80 text-rose-400 border border-rose-800/60 uppercase">FLASH INTEL</span>
			<span class="font-medium text-slate-200"><?php bloginfo( 'name' ); ?> Vendor-Neutral Infrastructure Audits</span>
			<span class="text-slate-600">|</span>
			<span class="text-slate-400"><?php echo esc_html( wp_count_posts()->publish ); ?> reports indexed</span>
		</div>
		<div class="flex items-center space-x-4 pl-4 shrink-0 text-[11px] font-mono text-slate-400">
			<span class="inline-flex items-center"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>API GATEWAY: NORMAL</span>
			<span><?php echo esc_html( date_i18n( 'Y.m.d H:i' ) ); ?></span>
		</div>
	</div>
</aside>

<header class="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
	<!-- Utility & brand row -->
	<div class="max-w-content mx-auto px-4 md:px-8 pt-3 md:pt-4 pb-3 flex items-center justify-between gap-3">
		<div class="flex items-center gap-3 md:gap-6 min-w-0">
			<a class="flex items-center shrink-0" href="<?php echo esc_url( home_url( '/' ) ); ?>">
				<?php if ( has_custom_logo() ) : ?>
					<?php the_custom_logo(); ?>
				<?php else : ?>
					<span class="font-serif-headline text-xl md:text-2xl font-bold text-slate-950 tracking-tight">One<span class="text-sky-600">Bet</span>Hub</span>
				<?php endif; ?>
			</a>
			<div class="h-8 w-px bg-slate-200 hidden md:block"></div>
			<div class="hidden md:flex flex-col min-w-0">
				<span class="text-[11px] font-bold tracking-widest uppercase text-slate-500 font-mono">B2B ENTERPRISE INTELLIGENCE</span>
				<span class="text-xs font-semibold text-slate-700 truncate"><?php bloginfo( 'description' ); ?></span>
			</div>
		</div>

		<!-- Search: desktop inline -->
		<div class="hidden lg:block w-[360px] xl:w-[420px] shrink-0">
			<?php get_search_form(); ?>
		</div>

		<div class="flex items-center gap-2 md:gap-5 shrink-0">
			<a href="<?php echo esc_url( home_url( '/?s=' ) ); ?>" class="lg:hidden w-9 h-9 flex items-center justify-center text-slate-500 hover:text-slate-900 rounded hover:bg-slate-50 transition" aria-label="<?php esc_attr_e( '검색', 'onebethub' ); ?>">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
			</a>

			<?php onebethub_language_switcher( 'header' ); ?>

			<a href="mailto:<?php echo esc_attr( get_bloginfo( 'admin_email' ) ); ?>" class="hidden md:inline-flex bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded transition shadow-sm items-center space-x-1.5">
				<svg class="w-3.5 h-3.5 text-sky-400" fill="currentColor" viewBox="0 0 20 20"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
				<span><?php esc_html_e( 'Executive Briefing', 'onebethub' ); ?></span>
			</a>
		</div>
	</div>

	<!-- 5-category taxonomy nav -->
	<nav class="border-t border-slate-200 bg-white" aria-label="<?php esc_attr_e( '주요 카테고리', 'onebethub' ); ?>">
		<div class="max-w-content mx-auto px-4 md:px-8 flex items-stretch text-sm font-medium overflow-x-auto whitespace-nowrap scrollbar-hide">
			<?php
			if ( has_nav_menu( 'primary' ) ) :
				wp_nav_menu(
					array(
						'theme_location' => 'primary',
						'container'      => false,
						'items_wrap'     => '%3$s',
						'walker'         => new OneBetHub_Nav_Walker(),
					)
				);
			else :
				$i = 0;
				foreach ( $onebethub_categories as $cat ) :
					$i++;
					$colors    = onebethub_category_colors( $cat->name );
					$en_label  = onebethub_category_en_label( $cat->name );
					$is_active = is_category( $cat->term_id );
					?>
					<a href="<?php echo esc_url( get_category_link( $cat ) ); ?>"
						class="flex items-center px-4 md:px-5 py-3 border-b-2 shrink-0 transition group
						<?php echo $is_active ? 'border-sky-600 text-sky-900 bg-sky-50/40 font-semibold' : 'border-transparent text-slate-700 hover:text-slate-900 hover:border-slate-300'; ?>">
						<span class="text-xs font-mono mr-2 font-bold <?php echo $is_active ? 'text-sky-600' : 'text-slate-400 group-hover:text-slate-600'; ?>"><?php echo esc_html( str_pad( $i, 2, '0', STR_PAD_LEFT ) ); ?></span>
						<span><?php echo esc_html( $cat->name ); ?></span>
						<?php if ( $en_label ) : ?>
							<span class="text-xs text-slate-400 font-normal ml-1.5 tracking-tight hidden sm:inline">(<?php echo esc_html( $en_label ); ?>)</span>
						<?php endif; ?>
					</a>
					<?php
				endforeach;
			endif;
			?>
		</div>
	</nav>
</header>

<main id="main-content" class="flex-1">
