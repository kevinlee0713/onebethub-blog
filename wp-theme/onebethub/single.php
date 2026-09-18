<?php
/**
 * Single article: header cluster (badges/headline/byline), featured image,
 * .entry-content wrapper around the_content() (Stage2/3 pipeline HTML —
 * tables, callouts etc. already live inside that HTML; this template does
 * not fabricate them), author bio, related-posts rail, Polylang link.
 * Ports the structural pattern of stitch-export/article-desktop.html
 * (translated from its "surface/on-surface" mockup palette to the site's
 * actual slate/sky/serif system used everywhere else, for visual
 * consistency across templates).
 */
get_header();
the_post();

$onebethub_cats  = get_the_category();
$read_minutes    = onebethub_estimated_read_minutes();
$primary_cat     = ! empty( $onebethub_cats ) ? $onebethub_cats[0] : null;
?>

<div class="max-w-content mx-auto px-4 md:px-8 py-3 text-xs text-slate-500 flex items-center gap-2 flex-wrap">
	<a class="hover:text-slate-900 transition" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'Home', 'onebethub' ); ?></a>
	<?php if ( $primary_cat ) : ?>
		<span class="text-slate-300">/</span>
		<a class="hover:text-slate-900 transition" href="<?php echo esc_url( get_category_link( $primary_cat ) ); ?>"><?php echo esc_html( $primary_cat->name ); ?></a>
	<?php endif; ?>
	<span class="text-slate-300">/</span>
	<span class="font-semibold text-slate-900 truncate max-w-xs md:max-w-md"><?php the_title(); ?></span>
</div>

<div class="max-w-content mx-auto px-4 md:px-8 pb-12">
	<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">

		<article class="lg:col-span-8">
			<!-- Header cluster -->
			<header class="mb-6">
				<div class="flex flex-wrap items-center gap-2 mb-4">
					<?php foreach ( $onebethub_cats as $cat ) : echo onebethub_category_badge( $cat, 'lg' ); endforeach; ?>
					<?php
					if ( function_exists( 'pll_the_languages' ) ) {
						echo '<span class="ml-auto">';
						pll_the_languages(
							array(
								'show_flags'  => 0,
								'show_names'  => 1,
								'dropdown'    => 0,
								'raw'         => 0,
							)
						);
						echo '</span>';
					}
					?>
				</div>
				<h1 class="font-serif-headline text-2xl md:text-4xl font-bold leading-tight text-slate-950 tracking-tight mb-4">
					<?php the_title(); ?>
				</h1>
				<?php if ( has_excerpt() ) : ?>
					<p class="font-serif-headline text-base md:text-lg text-slate-600 leading-relaxed mb-5"><?php echo esc_html( get_the_excerpt() ); ?></p>
				<?php endif; ?>

				<div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 border border-slate-200 p-4 rounded">
					<div class="flex items-center gap-3">
						<?php echo get_avatar( get_the_author_meta( 'ID' ), 44, '', '', array( 'class' => 'rounded-full ring-1 ring-slate-300 shadow-sm shrink-0' ) ); ?>
						<div class="flex flex-col">
							<span class="text-sm font-bold text-slate-900"><?php the_author(); ?></span>
							<span class="text-xs text-slate-500">
								<?php bloginfo( 'name' ); ?> · <time datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>"><?php echo esc_html( get_the_date() ); ?></time> ·
								<?php echo esc_html( sprintf( __( '읽는 시간 약 %d분', 'onebethub' ), $read_minutes ) ); ?>
							</span>
						</div>
					</div>
				</div>
			</header>

			<?php if ( has_post_thumbnail() ) : ?>
				<div class="w-full rounded-xl overflow-hidden shadow-sm mb-8">
					<?php the_post_thumbnail( 'large', array( 'class' => 'w-full h-auto object-cover' ) ); ?>
				</div>
			<?php endif; ?>

			<!-- Pipeline-generated body content -->
			<div class="entry-content">
				<?php the_content(); ?>
			</div>

			<?php
			wp_link_pages(
				array(
					'before' => '<nav class="page-links mt-8 text-sm text-slate-600">' . esc_html__( '페이지:', 'onebethub' ),
					'after'  => '</nav>',
				)
			);
			?>

			<!-- Author bio -->
			<footer class="mt-10 bg-slate-50 border border-slate-200 p-6 rounded-xl flex flex-col md:flex-row gap-5 items-start">
				<?php echo get_avatar( get_the_author_meta( 'ID' ), 64, '', '', array( 'class' => 'rounded-full shadow-sm shrink-0' ) ); ?>
				<div class="flex flex-col gap-1.5">
					<h2 class="font-serif-headline text-base font-bold text-slate-900"><?php the_author(); ?></h2>
					<?php if ( get_the_author_meta( 'description' ) ) : ?>
						<p class="text-xs text-slate-600 leading-relaxed pt-1"><?php echo esc_html( get_the_author_meta( 'description' ) ); ?></p>
					<?php endif; ?>
				</div>
			</footer>

			<?php
			if ( comments_open() || get_comments_number() ) :
				comments_template();
			endif;
			?>
		</article>

		<!-- Sidebar: related reports -->
		<aside class="lg:col-span-4 space-y-6">
			<div class="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
				<h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4"><?php esc_html_e( '연관 인텔리전스 리포트', 'onebethub' ); ?></h3>
				<?php
				$related_args = array(
					'posts_per_page' => 4,
					'post__not_in'   => array( get_the_ID() ),
					'post_status'    => 'publish',
					'onebethub_lang' => onebethub_current_view_lang(),
				);
				if ( $primary_cat ) {
					$related_args['category__in'] = array( $primary_cat->term_id );
				}
				$related = new WP_Query( $related_args );
				if ( $related->have_posts() ) :
					echo '<div class="space-y-4">';
					while ( $related->have_posts() ) :
						$related->the_post();
						?>
						<a href="<?php the_permalink(); ?>" class="group block pb-4 border-b border-slate-100 last:border-0 last:pb-0">
							<span class="text-[10px] font-bold uppercase tracking-wider text-slate-400"><?php echo esc_html( $primary_cat ? $primary_cat->name : '' ); ?></span>
							<h4 class="text-sm font-bold text-slate-900 group-hover:text-sky-700 leading-snug mt-1"><?php the_title(); ?></h4>
							<span class="text-[11px] text-slate-400 mt-1 inline-block"><?php echo esc_html( get_the_date() ); ?></span>
						</a>
						<?php
					endwhile;
					echo '</div>';
					wp_reset_postdata();
				else :
					echo '<p class="text-xs text-slate-500">' . esc_html__( '연관된 리포트가 아직 없습니다.', 'onebethub' ) . '</p>';
				endif;
				?>
			</div>

			<div class="bg-slate-900 text-slate-300 p-5 rounded-xl border border-slate-800">
				<div class="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-wider mb-2"><?php esc_html_e( 'Editorial Independence', 'onebethub' ); ?></div>
				<p class="text-xs text-slate-400 leading-relaxed"><?php bloginfo( 'name' ); ?><?php esc_html_e( '는 벤더 스폰서십 없이 공개 데이터에 기반해 리포트를 작성합니다.', 'onebethub' ); ?></p>
			</div>
		</aside>
	</div>
</div>

<?php get_footer(); ?>
