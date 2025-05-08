from setuptools import setup, find_packages

with open('README.rst') as readme_file:
    readme = readme_file.read()

requirements = [
    'girder>=5.0.0a2'
]

setup(
    name='wsi_superpixel_guided_labeling',
    author='Kitware, Inc.',
    author_email='kitware@kitware.com',
    classifiers=[
        'Development Status :: 2 - Pre-Alpha',
        'License :: OSI Approved :: Apache Software License',
        'Natural Language :: English',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.6',
        'Programming Language :: Python :: 3.7',
        'Programming Language :: Python :: 3.8'
    ],
    description='Perform active learning with superpixel classification.',
    install_requires=[
        'histomicsui',
        'large_image[tiff,openslide,memcached,openjpeg,converter]',
        'girder-large-image-annotation'
    ],
    license='Apache Software License 2.0',
    long_description=readme,
    long_description_content_type='text/x-rst',
    include_package_data=True,
    keywords='girder-plugin, wsi_superpixel_guided_labeling',
    packages=find_packages(exclude=['test', 'test.*']),
    url='https://github.com/DigitalSlideArchive/wsi-superpixel-guided-labeling',
    version='0.1.0',
    zip_safe=False,
    entry_points={
        'girder.plugin': [
            'wsi_superpixel_guided_labeling = wsi_superpixel_guided_labeling:WSISuperpixelGuidedLabelingPlugin'
        ]
    }
)
